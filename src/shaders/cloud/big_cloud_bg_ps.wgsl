@group(0) @binding(3) var linearSampler: sampler;
@group(0) @binding(4) var diffuseTexture: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) world_pos: vec4<f32>,
    @location(3) tangent: vec4<f32>,
};

@fragment
fn main(input: VertexOutput) -> @location(0) vec4<f32> {
    let color = textureSample(diffuseTexture, linearSampler, input.uv);

    return vec4(vec3(0.9)*2.,color.r*0.4);
}
