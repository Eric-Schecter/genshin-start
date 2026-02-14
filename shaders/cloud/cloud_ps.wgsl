@group(0) @binding(3) var sampler_linear_clamp: sampler;

@group(0) @binding(4) var diffuseTexture: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) world_pos: vec4<f32>,
    @location(3) tangent: vec4<f32>,
};

fn inv_rrt_odt_fit(v: vec3f) -> vec3f {
    let a: vec3f = -(
        sqrt(10.0) * sqrt(
            (-187248350.0 * pow(v, vec3f(2.0))) +
            (232585567.0 * v) +
            241290.0
        ) +
        (21650.0 * v) -
        1230.0
    );

    let b: vec3f = (98370.0 * v) - 100000.0;
    return a / b;
}

const ACES_INPUT_MAT: mat3x3<f32> = mat3x3<f32>(
    vec3<f32>(1.76474, -0.14702, -0.03633),
    vec3<f32>(-0.67577, 1.16025, -0.16243),
    vec3<f32>(-0.08896, -0.01322, 1.19877)
);

const ACES_OUTPUT_MAT: mat3x3<f32> = mat3x3<f32>(
    vec3<f32>(0.64304, 0.05926, 0.00596),
    vec3<f32>(0.31119, 0.93144, 0.06393),
    vec3<f32>(0.04578, 0.00929, 0.93012)
);

fn ACES_Inv(color: vec3f) -> vec3f {
    var result = ACES_OUTPUT_MAT * color;

    result = inv_rrt_odt_fit(result);

    result = ACES_INPUT_MAT * result;

    return result;
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4<f32> {
    var color = textureSample(diffuseTexture, sampler_linear_clamp, input.uv);
    let mask = color.rgb;

    let color_1 = vec3(0, 162./255., 240./255.);
    let color_2 = vec3(240./255., 240./255., 245./255.);
    let color_intensity_1 = 1.f;
    let color_intensity_2 = 1.f;

    let col_r = mix(color_1*color_intensity_1,color_2*color_intensity_2,vec3(pow(mask.r,0.6)));
    color = vec4(ACES_Inv(col_r), color.a);

    return color;
}
