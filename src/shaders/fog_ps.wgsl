@group(0) @binding(3) var<uniform> time: f32;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) world_pos: vec4<f32>,
    @location(3) tangent: vec4<f32>,
};

const F3 = 0.3333333;
const G3 = 0.1666667;

fn random3(c: vec3<f32>) -> vec3<f32> {
	var j = 4096.0*sin(dot(c,vec3(17.0, 59.4, 15.0)));
	var r = vec3(0.);
	r.z = fract(512.0*j);
	j *= .125;
	r.x = fract(512.0*j);
	j *= .125;
	r.y = fract(512.0*j);
	return r-0.5;
}

fn noise3d(p:vec3<f32>) -> f32 {
    let s = floor(p + dot(p, vec3(F3)));
    let x = p - s + dot(s, vec3(G3));

    let e = step(vec3(0.0), x - x.yzx);
    let i1 = e*(1.0 - e.zxy);
    let i2 = 1.0 - e.zxy*(1.0 - e);

    let x1 = x - i1 + G3;
    let x2 = x - i2 + 2.0*G3;
    let x3 = x - 1.0 + 3.0*G3;

    var w = vec4(dot(x, x), dot(x1, x1), dot(x2, x2), dot(x3, x3));

    w = max(vec4(0.6) - w, vec4(0.0));

    var d = vec4(dot(random3(s), x), dot(random3(s + i1), x1), dot(random3(s + i2), x2), dot(random3(s + 1.0), x3));

    w *= w;
    w *= w;
    d *= w;

    return dot(d, vec4(52.0));
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4<f32> {
	// let uv = input.uv*vec2(0.0024,0.0016);

	var f = 0.0;

    f = clamp(noise3d(input.world_pos.xyz*vec3(0.012,0.012,0.)+vec3(time*0.25))+0.2,0.,1.);
    f+= clamp(noise3d(input.world_pos.xyz*vec3(0.004,0.004,0.)-vec3(time*0.15))+0.1,0.,1.);

    f=clamp(f,0.,1.);

    f*=(1.-smoothstep(-5.,45.,input.world_pos.y));
    f*= (smoothstep(-200.,-35.,input.world_pos.y));

    f*=(smoothstep(0.,40.,input.world_pos.x)+(1.-smoothstep(-40.,-0.,input.world_pos.x)));

    return vec4(vec3(1.)*3.,f*0.3);
}
