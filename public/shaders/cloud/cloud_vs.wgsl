@group(0) @binding(0) var<uniform> view: mat4x4<f32>;
@group(0) @binding(1) var<uniform> proj: mat4x4<f32>;

struct InstanceData {
    modelMatrix: mat4x4<f32>,
};

@group(0) @binding(11) var<storage, read> instances: array<InstanceData>;

struct VertexInput {
    @builtin(instance_index) instance_idx: u32,
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

fn random(st:vec2<f32>)->f32 {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

@vertex
fn main(input: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    let modelMatrix = instances[input.instance_idx].modelMatrix;
    let world_pos = (modelMatrix * vec4<f32>(input.position, 1.0)).xyz;
    let instPosition = modelMatrix[3].xyz;

    let wh = vec2(2.,4.);
    let rn = ceil(random(instPosition.xy)*wh.x*wh.y);
    let cell = vec2(1.,1.)/wh;
    var vUv = input.uv/wh;
    vUv+=vec2(cell.x*(rn % wh.x),cell.y*(ceil(rn/wh.x)-1.));

    out.position = proj * view * vec4(world_pos, 1.0);
    out.uv = vUv;
    return out;
}

