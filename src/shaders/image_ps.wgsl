@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;

struct VertexInput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@fragment
fn main(input: VertexInput) -> @location(0) vec4<f32> {
    return textureSample(inputTexture, linearSampler, input.uv);
}
