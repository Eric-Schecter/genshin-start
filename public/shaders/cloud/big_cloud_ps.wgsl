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
    var color = textureSample(diffuseTexture, linearSampler, input.uv);
    let mask = color.rgb;

    let col_r = mix(vec3(23., 145., 250.)/255.,vec3(0.93),vec3(pow(mask.r,0.4)));
    color = vec4(col_r, color.a);

    return color;
}
