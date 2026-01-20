const PI: f32 = 3.141592653589793;

alias LightType = u32;
const LIGHT_TYPE_DIRECTIONAL: LightType = 0u;
const LIGHT_TYPE_POINT: LightType = 1u;
const LIGHT_TYPE_SPOT: LightType = 2u;

struct LightData {
    position: vec4<f32>,
    direction: vec4<f32>,
    color: vec4<f32>,
    params: vec4<f32>, // x: enabled, y: lightType
}

@group(0) @binding(3) var linearSampler: sampler;
@group(0) @binding(4) var diffuseTexture: texture_2d<f32>;
@group(0) @binding(5) var emissiveTexture: texture_2d<f32>;
@group(0) @binding(6) var normalTexture: texture_2d<f32>;
@group(0) @binding(7) var metallicRoughnessTexture: texture_2d<f32>;
@group(0) @binding(8) var occlusionTexture: texture_2d<f32>;
@group(0) @binding(9) var cubemap: texture_cube<f32>;
@group(0) @binding(10) var<uniform> cameraPos: vec3<f32>;
@group(0) @binding(12) var<uniform> ambientLight: vec4<f32>;
@group(0) @binding(13) var<storage, read> lights: array<LightData>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @builtin(front_facing) isFrontFace : bool,
    @location(0) normal: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) world_pos: vec3<f32>,
    @location(3) tangent: vec4<f32>,
};

fn getAmbient(N:vec3<f32>) -> vec3<f32> {
    let mips = textureNumLevels(cubemap);
    let maxMip = f32(mips - 1);
    return textureSampleLevel(cubemap, linearSampler, N, maxMip).rgb * ambientLight.rgb;
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

const MEDIUMP_FLT_MAX: f32 = 65504.0;

fn saturate_mediump(x: f32) -> f32 {
    return min(x, MEDIUMP_FLT_MAX);
}

// Normal Distribution Function, NDF
fn D_GGX(roughness:f32, NoH:f32) -> f32
{
	// Walter et al. 2007, "Microfacet Models for Refraction through Rough Surfaces"
    let oneMinusNoHSquared = 1.0 - NoH * NoH;

    let a = NoH * roughness;
    let k = roughness / (oneMinusNoHSquared + a * a);
    let d = k * k * (1.0 / PI);
    return saturate_mediump(d);
}

// Visibility
// Geometry Attenuation Term/Masking-Shadowing Function
fn V_SmithGGXCorrelated(roughness: f32, NoV: f32, NoL: f32) -> f32
{
	// Heitz 2014, "Understanding the Masking-Shadowing Function in Microfacet-Based BRDFs"
    let a2 = roughness * roughness;
	// TODO: lambdaV can be pre-computed for all the lights, it should be moved out of this function
    let lambdaV = NoL * sqrt((NoV - a2 * NoV) * NoV + a2);
    let lambdaL = NoV * sqrt((NoL - a2 * NoL) * NoL + a2);
    let v = 0.5 / (lambdaV + lambdaL);
	// a2=0 => v = 1 / 4*NoL*NoV   => min=1/4, max=+inf
	// a2=1 => v = 1 / 2*(NoL+NoV) => min=1/4, max=+inf
	// clamp to the maximum value representable in mediump
    return saturate_mediump(v);
}

fn BRDF_GetSpecular(roughness: f32, F: vec3<f32>,NdotH:f32, NdotV:f32,NdotL: f32) -> vec3<f32>
{
    // todo：anisotropy
    let roughnessBRDF = sqrt(clamp(roughness, 0.045, 1));
    let D = D_GGX(roughnessBRDF, NdotH);
    let Vis = V_SmithGGXCorrelated(roughnessBRDF, NdotV, NdotL);

    let specular = D * Vis * F;

    // sheen

    // clearcout

    return specular * NdotL;
}

fn BRDF_GetDiffuse(F:vec3<f32>, NdotL: f32) -> vec3<f32>
{
    let diffuse = vec3<f32>(1.f) - F;

    // todo
    // sss

    // sheen

    // clearcout

    return diffuse * NdotL;
}

fn light_directional(NdotH: f32, NdotV: f32, NdotL: f32,
    lightData: LightData, F: vec3<f32>, roughness: f32) -> LightingPart{
    var directLight:LightingPart;

    //todo: NdotV < 0
    if(NdotL > 0){
        directLight.diffuse = lightData.color.rgb * BRDF_GetDiffuse(F, NdotL);
        directLight.specular = lightData.color.rgb * BRDF_GetSpecular(roughness, F, NdotH, NdotV, NdotL);
    }

    return directLight;
}

fn light_spot() -> LightingPart{
    var directLight :LightingPart;

    return directLight;
}

fn light_point() -> LightingPart{
    var directLight :LightingPart;

    return directLight;
}

fn saturate(x: f32) -> f32 {
    return clamp(x, 0.0, 1.0);
}

// https://www.unrealengine.com/en-US/blog/physically-based-shading-on-mobile
fn EnvBRDFApprox(SpecularColor: vec3<f32>, Roughness: f32, NoV: f32) -> vec3<f32>
{
    let c0 = vec4(-1., -0.0275, -0.572, 0.022);
    let c1 = vec4(1, 0.0425, 1.04, -0.04);
    let r = Roughness * c0 + c1;
    let a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;
    let AB = vec2(-1.04, 1.04) * a004 + r.zw;
    return SpecularColor * AB.x + AB.y;
}

fn forwardLighting(N:vec3<f32>, V: vec3<f32>, f0: vec3<f32>, roughness: f32) -> LightingPart{
    var directLight :LightingPart;
    let light_count = 64u;

    let NdotV = saturate(dot(N, V) + 1e-5);
    let F = EnvBRDFApprox(f0, roughness, NdotV);

    for (var i = 0u; i < light_count; i++) {
        let light = lights[i];

        let L = normalize(light.direction.xyz);
        let H = normalize(-L + V);

        let NdotL = dot(-L, N);
        let NdotH = saturate(dot(N, H));
        let LdotH = saturate(dot(-L, H));
        let VdotH = saturate(dot(V, H));

        if(light.params.x == 1)
        {
            var res :LightingPart;
            switch (u32(light.params.y)){
                case LIGHT_TYPE_DIRECTIONAL {
                    res = light_directional(NdotH, NdotV, NdotL, light, F, roughness);
                    break;
                }
                case LIGHT_TYPE_SPOT {
                    res = light_spot();
                    break;
                }
                case LIGHT_TYPE_POINT {
                    res = light_point();
                    break;
                }
                default:{}
            }
            directLight.diffuse += res.diffuse;
            directLight.specular += res.specular;
        }
    }

    return directLight;
}

fn applyLighting(lighting:Lighting, color: vec3<f32>, emissive: vec3<f32>, F: vec3<f32>, occlusion: f32) -> vec4<f32>
{
    let diffuse = lighting.direct.diffuse / PI + lighting.indirect.diffuse * (vec3(1.f) - F) * occlusion;
    let specular = lighting.direct.specular + lighting.indirect.specular * occlusion;
    // let specular = vec3(0.0588, 0.4314, 1.0);

    return vec4(color * diffuse + specular + emissive, 1.f);
}

fn EnvironmentReflection_Global(R: vec3<f32>, F:vec3<f32>, roughness: f32) -> vec3<f32>
{
    let mips = textureNumLevels(cubemap);
    let maxMip = f32(mips - 1);
    let mip = roughness * maxMip;
    // return textureSampleLevel(cubemap, linearSampler, R, mip).rgb * ambientLight.rgb * F;
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

fn applyNormalMap(uv:vec2<f32>, TBN:mat3x3<f32>, n: vec3<f32>) -> vec3<f32>
{
    let normalmap = textureSample(normalTexture, linearSampler, uv);
    if(all(normalmap == vec4(0.))){
        return n;
    }
    var normal = vec3(normalmap.rg, 1.f);
    normal = normal * 2.f - vec3(1.f,1.f,1.f);
    // bump color
    return normalize(mix(normal, TBN * normal, length(normal)));
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4<f32> {
    let diffuse = textureSample(diffuseTexture, linearSampler, input.uv);

    let emissive = textureSample(emissiveTexture, linearSampler, input.uv).rgb;

    let normal = normalize(select(-input.normal, input.normal, input.isFrontFace));

    var T = select(-input.tangent.xyz, input.tangent.xyz, input.isFrontFace);
    T = normalize(T);
    let B = normalize(cross(T, normal) * input.tangent.w);
    let TBN = mat3x3<f32>(T, B, normal);

    var N = applyNormalMap(input.uv, TBN, normal);
    N = normal;

    let surfaceMap = textureSample(metallicRoughnessTexture, linearSampler, input.uv);
    let roughness = surfaceMap.g;
    let metalness = 0.f;//surfaceMap.b;
    let reflectance = 0.04f;
    let albedo = diffuse.rgb * (1.f - max(reflectance, metalness));
    let f0 = mix(vec3(reflectance), diffuse.rgb, metalness);

    let occlusion = textureSample(occlusionTexture, linearSampler, input.uv).r;

    var lighting = initLighting();

    let ambient = getAmbient(N);
    // lighting.indirect.diffuse = ambient;

    // todo: local probe
    var V = cameraPos - input.world_pos.xyz;
    let dist = length(V);
    V /= dist;

    let R = -reflect(V, N);

    let NdotV = clamp(dot(N, V), 1e-5, 1);

    let F = env_brdf_approx(f0, roughness, NdotV);

    let envmapAccumulation = EnvironmentReflection_Global(R, F, roughness);

    // lighting.indirect.specular += max(vec3<f32>(0.), envmapAccumulation);

    let directLight = forwardLighting(N, V, f0, roughness);
    lighting.direct.diffuse = directLight.diffuse;
    lighting.direct.specular = directLight.specular;

    let color = applyLighting(lighting, albedo, emissive, F, occlusion);

    // return vec4(clamp(normal, vec3(0.), vec3(1.)),1.f);
    // return vec4(lighting.direct.diffuse,1.);
    return color;
}
