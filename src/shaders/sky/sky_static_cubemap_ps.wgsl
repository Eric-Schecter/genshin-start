const PI: f32 = 3.141592653589793;

struct Camera {
    inverse_view_projection : mat4x4<f32>,
    position : vec3<f32>
}

@group(0) @binding(0) var linearSampler: sampler;

@group(0) @binding(1) var texture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> camera: Camera;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

fn clipSpaceToWorldPos(clipspace:vec2<f32>) -> vec4<f32> {
    var unprojected = camera.inverse_view_projection * vec4(clipspace,1,1);
    unprojected.x = unprojected.x / unprojected.w;
    unprojected.y = unprojected.y / unprojected.w;
    unprojected.z = unprojected.z / unprojected.w;
    return unprojected;
}

fn getStaticSkyColor(V:vec3<f32>) -> vec3<f32>
{
    // todo: cubemap
    let uv = (vec2(-atan2(V.z, V.x) / PI, -V.y) + 1.0) * 0.5;
    // sky = textureSampleBias(texture, sampler_linear_clamp, uv, 0).rgb;
    var sky = textureSampleBias(texture, linearSampler, uv, 0).rgb;

    let sky_exposure = 1.f;
    sky *= sky_exposure;

    return sky;
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4<f32> {
    let unprojected = clipSpaceToWorldPos(input.uv);

    let V = normalize(unprojected.xyz - camera.position);

    var color = vec4(getStaticSkyColor(V), 1);

    color = clamp(color, vec4(0.0), vec4(65000.0));

    return color;
};
