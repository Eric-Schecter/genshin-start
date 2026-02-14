const GENERATEMIPCHAIN_2D_BLOCK_SIZE: u32 = 8u;

struct Mipgen
{
    outputResolution: vec2<f32>,
    outputResolution_rcp: vec2<f32>,
};

@group(0) @binding(0) var<uniform> mipgen: Mipgen;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var texSampler: sampler;
@group(0) @binding(3) var outputTexture: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(GENERATEMIPCHAIN_2D_BLOCK_SIZE, GENERATEMIPCHAIN_2D_BLOCK_SIZE, 1)
fn main(@builtin(global_invocation_id) DTid: vec3<u32>) {
    if (DTid.x >= u32(mipgen.outputResolution.x) || DTid.y >= u32(mipgen.outputResolution.y)) {
        return;
    }

    let uv = (vec2<f32>(DTid.xy) + vec2(0.5)) * mipgen.outputResolution_rcp;

    let texel_size = mipgen.outputResolution_rcp;

    let base_uv = ((vec2<f32>(DTid.xy) + 0.5) * mipgen.outputResolution_rcp.xy);
    let half_pixel = texel_size * 0.5;

    let uv_top_left = base_uv - half_pixel;
    let uv_top_right = base_uv + vec2<f32>(half_pixel.x, -half_pixel.y);
    let uv_bottom_left = base_uv + vec2<f32>(-half_pixel.x, half_pixel.y);
    let uv_bottom_right = base_uv + half_pixel;

    let sample_tl = textureSampleLevel(inputTexture, texSampler, uv_top_left, 0.0);
    let sample_tr = textureSampleLevel(inputTexture, texSampler, uv_top_right, 0.0);
    let sample_bl = textureSampleLevel(inputTexture, texSampler, uv_bottom_left, 0.0);
    let sample_br = textureSampleLevel(inputTexture, texSampler, uv_bottom_right, 0.0);

    let rrrr = vec4<f32>(sample_tl.r, sample_tr.r, sample_bl.r, sample_br.r);
    let gggg = vec4<f32>(sample_tl.g, sample_tr.g, sample_bl.g, sample_br.g);
    let bbbb = vec4<f32>(sample_tl.b, sample_tr.b, sample_bl.b, sample_br.b);
    let aaaa = vec4<f32>(sample_tl.a, sample_tr.a, sample_bl.a, sample_br.a);

    var color = vec3(0.);
    var a = 0.f;
    let sum = aaaa.x + aaaa.y + aaaa.z + aaaa.w;

    if (sum > 0)
    {
        // Weight by alpha if it has even partially opaque pixels:
        //	This avoids losing alpha coverage, it will extrude the areas which have alpha
        //	And also avoids bleeding in background color from transparent area
        color += vec3(rrrr.x, gggg.x, bbbb.x) * aaaa.x;
        color += vec3(rrrr.y, gggg.y, bbbb.y) * aaaa.y;
        color += vec3(rrrr.z, gggg.z, bbbb.z) * aaaa.z;
        color += vec3(rrrr.w, gggg.w, bbbb.w) * aaaa.w;
        color /= sum;
        a = max(aaaa.x, max(aaaa.y, max(aaaa.z, aaaa.w)));
    }

    textureStore(outputTexture, DTid.xy, vec4(color,a));
}
