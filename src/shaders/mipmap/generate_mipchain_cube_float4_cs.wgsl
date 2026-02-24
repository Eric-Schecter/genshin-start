const GENERATEMIPCHAIN_2D_BLOCK_SIZE: u32 = 8u;

struct Mipgen
{
    outputResolution: vec2<f32>,
    outputResolution_rcp: vec2<f32>,
};

@group(0) @binding(0) var<uniform> mipgen: Mipgen;
@group(0) @binding(1) var inputTexture: texture_cube<f32>;
@group(0) @binding(2) var texSampler: sampler;
@group(0) @binding(3) var outputTexture: texture_storage_2d_array<rgba32float, write>;

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

@compute @workgroup_size(GENERATEMIPCHAIN_2D_BLOCK_SIZE, GENERATEMIPCHAIN_2D_BLOCK_SIZE, 1)
fn main(@builtin(global_invocation_id) DTid: vec3<u32>) {
    if (DTid.x >= u32(mipgen.outputResolution.x) || DTid.y >= u32(mipgen.outputResolution.y)) {
        return;
    }

    let uv = (vec2<f32>(DTid.xy) + vec2(0.5)) * mipgen.outputResolution_rcp;

    let N = uv_to_cubemap(uv, DTid.z);

    let color = textureSampleLevel(inputTexture, texSampler, N, 0);

    textureStore(outputTexture, DTid.xy, DTid.z, color);
}
