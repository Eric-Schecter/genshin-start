// A uniform 2D random generator for hemisphere sampling: http://holger.dammertz.org/stuff/notes_HammersleyOnHemisphere.html
//	idx	: iteration index
//	num	: number of iterations in total
fn hammersley2d(idx: u32, num: u32) -> vec2<f32> {
    var bits = idx;

    bits = (bits << 16u) | (bits >> 16u);
    bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
    bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
    bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
    bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);

    let radicalInverse_VdC = f32(bits) * 2.3283064365386963e-10;  // 0x100000000

    return vec2<f32>(f32(idx) / f32(num), radicalInverse_VdC);
}

// Diffuse
// Normal Distribution Function, NDF
fn D_GGX(roughness: f32, NoH: f32) -> f32
{
	// Walter et al. 2007, "Microfacet Models for Refraction through Rough Surfaces"
    let oneMinusNoHSquared = 1.0 - NoH * NoH;

    let a = NoH * roughness;
    let k = roughness / (oneMinusNoHSquared + a * a);
    let d = k * k * (1.0 / PI);
    return  min(d, 65504.0);
}

// From "Real Shading in UnrealEngine 4" by Brian Karis, page 4
//	https://blog.selfshadow.com/publications/s2013-shading-course/karis/s2013_pbs_epic_notes_v2.pdf
fn ImportanceSampleGGX(Xi: vec2<f32>, Roughness: f32, N: vec3<f32>) -> vec4<f32>
{
	let a = Roughness * Roughness;
	let Phi = 2 * PI * Xi.x;
	let CosTheta = sqrt((1 - Xi.y) / (1 + (a * a - 1) * Xi.y));
	let SinTheta = sqrt(1 - CosTheta * CosTheta);

	// Additional PDF:
	//	https://github.com/KhronosGroup/glTF-Sample-Viewer/blob/main/source/shaders/ibl_filtering.frag
	var pdf = D_GGX(a, CosTheta);
	pdf /= 4.0;

	let H = vec3(
        SinTheta * cos(Phi),
        SinTheta * sin(Phi),
        CosTheta
    );
    let condition = select(0.0, 1.0, abs(N.z) < 0.999);
    let UpVector = mix(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, 0.0, 1.0), condition);
	let TangentX = normalize(cross(UpVector, N));
	let TangentY = cross(N, TangentX);
	// Tangent to world space
	return vec4(TangentX * H.x + TangentY * H.y + N * H.z, pdf);
}

// Mipmap Filtered Samples (GPU Gems 3, 20.4)
// https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-20-gpu-based-importance-sampling
// https://cgg.mff.cuni.cz/~jaroslav/papers/2007-sketch-fis/Final_sap_0073.pdf
fn computeLod(pdf: f32, width: u32, sampleCount: u32) -> f32
{
	// https://cgg.mff.cuni.cz/~jaroslav/papers/2007-sketch-fis/Final_sap_0073.pdf
	let lod = 0.5 * log2(6.0 * f32(width) * f32(width) / (f32(sampleCount) * pdf));

	return lod;
}

fn uv_to_cubemap(uv0:vec2<f32>, faceIndex: u32) -> vec3<f32>
{
	// get uv in [-1, 1] range:
    var uv = uv0 * 2 - 1;

	// and UV.y should point upwards:
    uv.y *= -1;

    switch (faceIndex)
    {
        case 0:{
		// +X
            return vec3(1, uv.y, -uv.x);
        }
        case 1:{
		// -X
            return vec3(-1, uv.yx);
        }
        case 2:{
		// +Y
            return vec3(uv.x, 1, -uv.y);
        }
        case 3:{
		// -Y
            return vec3(uv.x, -1, uv.y);
        }
        case 4:{
		// +Z
            return vec3(uv, 1);
        }
        case 5:{
		// -Z
            return vec3(-uv.x, uv.y, -1);
        }
        default:{
		// error
            return vec3(0.f);
        }
    }
}

const THREAD_OFFLOAD: u32 = 16;
const GENERATEMIPCHAIN_2D_BLOCK_SIZE: u32 = 8;
const PI: f32 = 3.14159265359;
const E: f32 = 2.71828182846;

struct Params {
    filterResolution: vec2<f32>,
    filterResolution_rcp: vec2<f32>,
    filterRoughness: f32,
    filterRayCount: f32
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var inputCubemap: texture_cube<f32>;
@group(0) @binding(2) var linearSampler: sampler;

@group(0) @binding(3) var outputTexture: texture_storage_2d_array<rgba32float, write>;

var<workgroup> shared_colors: array<array<array<vec4<f32>, THREAD_OFFLOAD>, GENERATEMIPCHAIN_2D_BLOCK_SIZE>, GENERATEMIPCHAIN_2D_BLOCK_SIZE>;

@compute @workgroup_size(GENERATEMIPCHAIN_2D_BLOCK_SIZE, GENERATEMIPCHAIN_2D_BLOCK_SIZE, THREAD_OFFLOAD)
fn main(@builtin(global_invocation_id) DTid: vec3<u32>, @builtin(local_invocation_id) GTid: vec3<u32>)
{
    let out_of_bounds = (DTid.x >= u32(params.filterResolution.x) || DTid.y >= u32(params.filterResolution.y));

    let threadstart = DTid.z % THREAD_OFFLOAD;
    let face = u32(DTid.z / THREAD_OFFLOAD);

    if (!out_of_bounds) {
        let uv = (vec2<f32>(DTid.xy) + 0.5) * params.filterResolution_rcp;
        let N = normalize(uv_to_cubemap(uv, face));
        let V = N;

        var col = vec4<f32>(0.0);

        let rayCount = u32(params.filterRayCount);

        for (var i = threadstart; i < rayCount; i += THREAD_OFFLOAD)
        {
            let Xi = hammersley2d(i, rayCount);
            let importanceSample = ImportanceSampleGGX(Xi, params.filterRoughness, N);
            let H = importanceSample.xyz;
            let pdf = importanceSample.w;
            let L = 2.0 * dot(V, H) * H - V;

            let NoL = max(dot(N, L), 0.0);
            if (NoL > 0.0)
            {
                let dim = textureDimensions(inputCubemap, 0);
                let lod = computeLod(pdf, dim.x, rayCount);
                col += textureSampleLevel(inputCubemap, linearSampler, L, lod) * NoL;
            }
        }

        shared_colors[GTid.x][GTid.y][threadstart] = col;
    }
    else {
        shared_colors[GTid.x][GTid.y][threadstart] = vec4<f32>(0.0);
    }

    workgroupBarrier();
    storageBarrier();

	if(threadstart == 0)
	{
	    var accum = vec4<f32>(1.0);
		for (var j = 0; j < i32(THREAD_OFFLOAD); j++)
		{
			accum += shared_colors[GTid.x][GTid.y][j];
		}
        if (accum.a > 0.0) {
            accum = accum / vec4<f32>(accum.a);
        }
        textureStore(outputTexture, vec2<i32>(DTid.xy), i32(face), accum);
	}
}
