const PI: f32 = 3.141592653589793;

@group(0) @binding(3) var linearSampler: sampler;

@group(0) @binding(4) var diffuseTexture: texture_2d<f32>;
@group(0) @binding(5) var emissiveTexture: texture_2d<f32>;
@group(0) @binding(6) var normalTexture: texture_2d<f32>;
@group(0) @binding(7) var metallicRoughnessTexture: texture_2d<f32>;
@group(0) @binding(8) var occlusionTexture: texture_2d<f32>;

@group(0) @binding(9) var cubemap: texture_cube<f32>;

@group(0) @binding(10) var<uniform> cameraPos: vec3<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @builtin(front_facing) isFrontFace : bool,
    @location(0) normal: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) world_pos: vec4<f32>,
    @location(3) tangent: vec4<f32>,
};

fn getAmbient(N:vec3<f32>) -> vec3<f32> {
    let mips = textureNumLevels(cubemap);
    let maxMip = f32(mips - 1);
    return textureSampleLevel(cubemap, linearSampler, N, maxMip).rgb;
}

struct LightingPart
{
    diffuse:vec3<f32>,
    specular:vec3<f32>,
};
struct Lighting
{
    direct:LightingPart,
    indirect:LightingPart,
};

fn initLighting() -> Lighting {
  var lighting: Lighting;
  lighting.direct.diffuse = vec3<f32>(0.0);
  lighting.direct.specular = vec3<f32>(0.0);
  lighting.indirect.diffuse = vec3<f32>(0.0);
  lighting.indirect.specular = vec3<f32>(0.0);
  return lighting;
}

fn applyLighting(lighting:Lighting, color: vec3<f32>, emissive: vec3<f32>, F: vec3<f32>, occlusion: f32) -> vec4<f32>
{
    let diffuse = lighting.direct.diffuse / PI + lighting.indirect.diffuse * (vec3(1.f) - F) * occlusion;
    let specular = lighting.direct.specular + lighting.indirect.specular * occlusion;

    return vec4(color * diffuse + specular + emissive, 1.f);
}

fn EnvironmentReflection_Global(R: vec3<f32>, F:vec3<f32>, roughness: f32) -> vec3<f32>
{
    let mips = textureNumLevels(cubemap);
    let maxMip = f32(mips - 1);
    let mip = roughness * maxMip;
    return textureSampleLevel(cubemap, linearSampler, R, mip).rgb * F;
}

fn env_brdf_approx(
  specular_color: vec3<f32>,
  roughness: f32,
  no_v: f32
) -> vec3<f32> {
  let c0 = vec4<f32>(-1.0, -0.0275, -0.572, 0.022);
  let c1 = vec4<f32>(1.0, 0.0425, 1.04, -0.04);

  let r = roughness * c0 + c1;

  let a004 = min(r.x * r.x, exp2(-9.28 * no_v)) * r.x + r.y;

  let AB = vec2<f32>(-1.04, 1.04) * a004 + r.zw;

  return specular_color * AB.x + AB.y;
}

fn applyNormalMap(uv:vec2<f32>, TBN:mat3x3<f32>) -> vec3<f32>
{
    var normal = vec3(textureSample(normalTexture, linearSampler, uv).rg, 1.f);
    normal = normal * 2.f - vec3(1.f,1.f,1.f);
    // bump color
    return normalize(mix(normal, TBN * normal, length(normal)));
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4<f32> {
    let diffuse = textureSample(diffuseTexture, linearSampler, input.uv);

    let emissive = textureSample(emissiveTexture, linearSampler, input.uv).rgb;

    var T = select(-input.tangent.xyz, input.tangent.xyz, input.isFrontFace);
    T = normalize(T);
    let B = normalize(cross(T, input.normal) * input.tangent.w);
    let TBN = mat3x3<f32>(T, B, input.normal);

    let N = applyNormalMap(input.uv, TBN);

    let surfaceMap = textureSample(metallicRoughnessTexture, linearSampler, input.uv);
    let roughness = surfaceMap.g;
    let metalness = surfaceMap.b;
    let reflectance = 0.04f;
    let albedo = diffuse.rgb * (1.f - max(reflectance, metalness));
    let f0 = mix(vec3(reflectance), diffuse.rgb, metalness);

    let occlusion = textureSample(occlusionTexture, linearSampler, input.uv).r;

    let ambient = getAmbient(N);

    var lighting = initLighting();
    lighting.indirect.diffuse = ambient;

    // todo: local probe
    var V = cameraPos - input.world_pos.xyz;
    let dist = length(V);
    V /= dist;

    let R = -reflect(V, N);

    let NdotV = clamp(dot(N, V), 1e-5, 1);

    let F = env_brdf_approx(f0, roughness, NdotV);

    let envmapAccumulation = EnvironmentReflection_Global(R, F, roughness);

    lighting.indirect.specular += max(vec3<f32>(0.), envmapAccumulation);

    let color = applyLighting(lighting, albedo, emissive, F, occlusion);

    return vec4(N,1.);
}
