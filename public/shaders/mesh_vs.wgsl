@group(0) @binding(0) var<uniform> view: mat4x4<f32>;
@group(0) @binding(1) var<uniform> proj: mat4x4<f32>;
@group(0) @binding(2) var<uniform> model: mat4x4<f32>;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) tangent: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) world_pos: vec4<f32>,
    @location(3) tangent: vec4<f32>,
};

@vertex
fn main(input: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    let world_pos = (model * vec4<f32>(input.position, 1.0)).xyz;
    let world_normal = normalize((model * vec4<f32>(input.normal, 0.0)).xyz);
    out.position = proj * view * vec4(world_pos, 1.0);
    out.normal = world_normal;
    out.uv = input.uv;
    out.world_pos = out.position;
    out.tangent = input.tangent;
    return out;
}

