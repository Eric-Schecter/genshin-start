@group(0) @binding(3) var linearSampler: sampler;
@group(0) @binding(4) var diffuseTexture: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) world_pos: vec4<f32>,
    @location(3) tangent: vec4<f32>,
};

fn rrt_odt_fit(v: vec3f) -> vec3f {
    let a: vec3f = v * (v + 0.0245786) - 0.000090537;
    let b: vec3f = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
}

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

fn mat3_from_rows(c0: vec3f, c1: vec3f, c2: vec3f) -> mat3x3<f32> {
    var m: mat3x3<f32> = mat3x3<f32>(
        vec3f(c0.x, c1.x, c2.x),
        vec3f(c0.y, c1.y, c2.y),
        vec3f(c0.z, c1.z, c2.z)
    );
    return m;
}

fn aces_fitted(color: vec3f) -> vec3f {
    let ACES_INPUT_MAT: mat3x3<f32> = mat3_from_rows(
        vec3f(0.59719, 0.35458, 0.04823),
        vec3f(0.07600, 0.90834, 0.01566),
        vec3f(0.02840, 0.13383, 0.83777)
    );

    let ACES_OUTPUT_MAT: mat3x3<f32> = mat3_from_rows(
        vec3f(1.60475, -0.53108, -0.07367),
        vec3f(-0.10208, 1.10813, -0.00605),
        vec3f(-0.00327, -0.07276, 1.07602)
    );

    var result: vec3f = ACES_INPUT_MAT * color;

    result = rrt_odt_fit(result);

    result = ACES_OUTPUT_MAT * result;

    return result;
}

fn ACES_Inv(color: vec3f) -> vec3f {
    let ACES_INPUT_MAT: mat3x3<f32> = mat3_from_rows(
        vec3f(1.76474, -0.67577, -0.08896),
        vec3f(-0.14702, 1.16025, -0.01322),
        vec3f(-0.03633, -0.16243, 1.19877)
    );

    let ACES_OUTPUT_MAT: mat3x3<f32> = mat3_from_rows(
        vec3f(0.64304, 0.31119, 0.04578),
        vec3f(0.05926, 0.93144, 0.00929),
        vec3f(0.00596, 0.06393, 0.93012)
    );

    var result: vec3f = ACES_OUTPUT_MAT * color;

    // Apply inverse RRT and ODT
    result = inv_rrt_odt_fit(result);

    result = ACES_INPUT_MAT * result;

    return result;
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4<f32> {
    var color = textureSample(diffuseTexture, linearSampler, input.uv);
    let mask = color.rgb;

    let col_r = mix(vec3(23., 145., 250.)/255.,vec3(0.93),vec3(pow(mask.r,0.4)));
    color = vec4(ACES_Inv(col_r), color.a);

    return color;
}
