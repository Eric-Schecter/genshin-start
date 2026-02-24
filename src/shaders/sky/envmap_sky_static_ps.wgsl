const PI: f32 = 3.141592653589793;

@group(0) @binding(2) var texture: texture_2d<f32>;
@group(0) @binding(3) var linearSampler: sampler;

fn getStaticSkyColor(V:vec3<f32>) -> vec3<f32>
{
    // todo: cubemap
    let uv = (vec2(-atan2(V.z, V.x) / PI, V.y) + 1.0) * 0.5;
    // sky = textureSampleBias(texture, sampler_linear_clamp, uv, 0).rgb;
    var sky = textureSampleBias(texture, linearSampler, uv, 0).rgb;

    let sky_exposure = 1.f;
    sky *= sky_exposure;

    return sky;
}

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) normal: vec3<f32>,
};

@fragment
fn main(input:VertexOutput) -> @location(0) vec4<f32>
{
    let normal = normalize(input.normal);
    let color = getStaticSkyColor(normal);
    return vec4<f32>(color, 1.0);
};
