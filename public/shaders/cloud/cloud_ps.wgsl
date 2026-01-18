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

    let color_1 = vec3(0, 162./255., 240./255.);
    let color_2 = vec3(240./255., 240./255., 245./255.);
    let color_intensity_1 = 1.f;
    let color_intensity_2 = 1.f;

    let col_r = mix(color_1*color_intensity_1,color_2*color_intensity_2,vec3(pow(mask.r,0.6)));
    color = vec4(col_r, color.a);

    return color;
}
