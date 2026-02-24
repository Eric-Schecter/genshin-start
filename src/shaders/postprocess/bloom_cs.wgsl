const POSTPROCESS_BLOCKSIZE: u32 = 8u;

struct Params
{
    resolution_rcp: vec2<f32>,
    bloom: vec2<f32>, // x: exposure, y: threshold
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var sampler_linear_clamp: sampler;
@group(0) @binding(3) var outputTexture: texture_storage_2d<rgba32float, write>;

@compute @workgroup_size(POSTPROCESS_BLOCKSIZE, POSTPROCESS_BLOCKSIZE, 1)
fn main(@builtin(global_invocation_id) DTid: vec3<u32>) {
    let uv = vec2<f32>(DTid.xy) + vec2(0.5, 0.5);

    var color = vec3(0.);
    color += textureSampleLevel(inputTexture, sampler_linear_clamp, (uv + vec2(-0.5, -0.5)) * params.resolution_rcp, 0).rgb;
    color += textureSampleLevel(inputTexture, sampler_linear_clamp, (uv + vec2(0.5, -0.5)) * params.resolution_rcp, 0).rgb;
    color += textureSampleLevel(inputTexture, sampler_linear_clamp, (uv + vec2(-0.5, 0.5)) * params.resolution_rcp, 0).rgb;
    color += textureSampleLevel(inputTexture, sampler_linear_clamp, (uv + vec2(0.5, 0.5)) * params.resolution_rcp, 0).rgb;

    color /= 4.0f;

    let exposure = params.bloom.x;
    let threshold = params.bloom.y;
    color *= exposure;

    color = min(color, vec3(10.)); // clamp upper limit: avoid incredibly large values to overly dominate bloom (high speculars were causing problems)
    color = max(color - vec3(threshold), vec3(0.));

    textureStore(outputTexture, DTid.xy, vec4(color, 1.));
}
