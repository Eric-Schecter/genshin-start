@group(0) @binding(3) var linearSampler: sampler;
@group(0) @binding(4) var lightTexture: texture_2d<f32>;
@group(0) @binding(5) var<uniform> cameraPos: vec3<f32>;
@group(0) @binding(6) var<uniform> time: f32;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) world_pos: vec4<f32>,
    @location(3) tangent: vec4<f32>,
};

@fragment
fn main(input: VertexOutput) -> @location(0) vec4<f32> {
    var uv = input.uv;
    uv.y = 1. - uv.y;
    var mask = 1.5*textureSample(lightTexture,linearSampler,uv+vec2(time*0.015,0.)).r;
    mask+= textureSample(lightTexture,linearSampler,uv*vec2(0.4,1.)+vec2(time*-0.0075,0.)).r;

    let col = vec4(vec3(1.8),mask);

    let distanceToCamera = distance(cameraPos,input.world_pos.xyz);
    var a = col.a;
    a*=smoothstep(200.,1000.,distanceToCamera);
    a*=smoothstep(0.0,0.5,uv.y);
    a*=smoothstep(0.0,0.1,uv.x)*smoothstep(1.0,0.9,uv.x);
    return vec4(col.rgb, a);
}
