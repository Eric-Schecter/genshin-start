@group(0) @binding(0) var linearSampler: sampler;
@group(0) @binding(1) var texture: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@fragment
fn main(input: VertexOutput) -> @location(0) vec4<f32> {
    var color = textureSampleBias(texture, linearSampler, input.uv, 0);

    color = clamp(color, vec4(0.0), vec4(65000.0));

    return color;
};
