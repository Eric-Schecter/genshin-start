const POSTPROCESS_BLOCKSIZE: u32 = 8u;

struct Params
{
    outputResolution: vec2<f32>,
    outputResolution_rcp: vec2<f32>,
    bloom: vec4<f32>,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var sampler_linear_clamp: sampler;
@group(0) @binding(3) var outputTexture: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var bloomTexture: texture_2d<f32>;

const ACES_INPUT_MAT: mat3x3<f32> = mat3x3<f32>(
    vec3<f32>(0.59719, 0.07600, 0.02840),
    vec3<f32>(0.35458, 0.90834, 0.13383),
    vec3<f32>(0.04823, 0.01566, 0.83777)
);

const ACES_OUTPUT_MAT: mat3x3<f32> = mat3x3<f32>(
    vec3<f32>(1.60475, -0.10208, -0.00327),
    vec3<f32>(-0.53108, 1.10813, -0.07276),
    vec3<f32>(-0.07367, -0.00605, 1.07602)
);

fn RRTAndODTFit(v: vec3<f32>) -> vec3<f32> {
    let a = v * (v + 0.0245786) - 0.000090537;
    let b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
}

fn ACESFitted(color: vec3<f32>) -> vec3<f32> {
    var result = color;

    result = ACES_INPUT_MAT * result;

    result = RRTAndODTFit(result);

    result = ACES_OUTPUT_MAT * result;

    result = clamp(result, vec3<f32>(0.0), vec3<f32>(1.0));

    return result;
}

fn ApplySRGBCurve_Fast_Mix(x: vec3<f32>) -> vec3<f32> {
    let cutoff = vec3<f32>(0.0031308);
    let linear = 12.92 * x;
    let gamma = 1.13005 * sqrt(x - 0.00228) - 0.13448 * x + 0.005719;

    let mask = step(x, cutoff);
    return mix(gamma, linear, mask);
}

@compute @workgroup_size(POSTPROCESS_BLOCKSIZE, POSTPROCESS_BLOCKSIZE, 1)
fn main(@builtin(global_invocation_id) DTid: vec3<u32>) {
    let uv = (vec2<f32>(DTid.xy) + vec2(0.5, 0.5)) * params.outputResolution_rcp;

    var hdr = textureSampleLevel(inputTexture, sampler_linear_clamp, uv, 0).rgb;

    // bloom
    let exposure = params.bloom.x;
    hdr *= exposure;

    var bloom = textureSampleLevel(bloomTexture, sampler_linear_clamp, uv, 1.5f).rgb;
    bloom += textureSampleLevel(bloomTexture, sampler_linear_clamp, uv, 3.5f).rgb;
    bloom += textureSampleLevel(bloomTexture, sampler_linear_clamp, uv, 4.5f).rgb;
    bloom /= 3.0f;
    hdr += bloom;

    //    var bloom = textureSampleLevel(bloomTexture, sampler_linear_clamp, uv, 0.f).rgb;

    // tonemap
    let aces = ACESFitted(hdr);
    let color = ApplySRGBCurve_Fast_Mix(aces);

    textureStore(outputTexture, DTid.xy, vec4(color,1.f));
}
