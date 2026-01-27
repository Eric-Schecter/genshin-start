alias ShadowMapType = u32;
const SHADOW_TYPE_NORMAL: ShadowMapType = 0u;
const SHADOW_TYPE_PCF: ShadowMapType = 1u;
const SHADOW_TYPE_VSM: ShadowMapType = 2u;

override SHADOWMAP_TYPE: u32 = SHADOW_TYPE_PCF;
override CARTOON: bool = true;
override USE_FOG: bool = true;
override FOG_EXP2: bool = true;

const PI: f32 = 3.141592653589793;
const PI2: f32 = 6.28318531;

alias LightType = u32;
const LIGHT_TYPE_DIRECTIONAL: LightType = 0u;
const LIGHT_TYPE_POINT: LightType = 1u;
const LIGHT_TYPE_SPOT: LightType = 2u;

struct LightData {
    position: vec4<f32>,
    direction: vec4<f32>,
    color: vec4<f32>,
    matrix: mat4x4<f32>,
    shadowAtlasMulAdd: vec4<f32>,
    params: vec4<f32>, // x: enabled, y: lightType, z: cascadeCount
}

struct ShaderMaterial {
    baseColor: vec4<f32>,
    roughness: f32,
    reflectance: f32,
    metalness: f32,
    refraction: f32,
}

@group(0) @binding(4) var diffuseTexture: texture_2d<f32>;
@group(0) @binding(5) var emissiveTexture: texture_2d<f32>;
@group(0) @binding(6) var normalTexture: texture_2d<f32>;
@group(0) @binding(7) var metallicRoughnessTexture: texture_2d<f32>;
@group(0) @binding(8) var occlusionTexture: texture_2d<f32>;
@group(0) @binding(9) var cubemap: texture_cube<f32>;
@group(0) @binding(10) var<uniform> cameraPos: vec3<f32>;
@group(0) @binding(11) var linearSampler: sampler;
@group(0) @binding(12) var<uniform> ambientLight: vec4<f32>;
@group(0) @binding(13) var<storage, read> lights: array<LightData>;
@group(0) @binding(14) var<uniform> shadow_atlas_resolution: vec2<f32>;
@group(0) @binding(15) var shadowAtlasTexture: texture_depth_2d;
@group(0) @binding(16) var sampler_cmp_depth: sampler_comparison;
@group(0) @binding(17) var<uniform> material: ShaderMaterial;
@group(0) @binding(18) var anisoSampler: sampler;
@group(0) @binding(19) var<uniform> screen_size: vec2<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @builtin(front_facing) isFrontFace : bool,
    @location(0) normal: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) world_pos: vec3<f32>,
    @location(3) tangent: vec4<f32>,
    @location(4) view_pos: vec3<f32>,
};

fn getAmbient(N:vec3<f32>) -> vec3<f32> {
    let mips = textureNumLevels(cubemap);
    let maxMip = f32(mips - 1);
    return textureSampleLevel(cubemap, linearSampler, N, maxMip).rgb + ambientLight.rgb;
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

fn initLightingPart() -> LightingPart
{
    var lightingPart: LightingPart;
    lightingPart.diffuse = vec3<f32>(0.0);
    lightingPart.specular = vec3<f32>(0.0);
    return lightingPart;
}

fn initLighting() -> Lighting {
  var lighting: Lighting;
  lighting.direct = initLightingPart();
  lighting.indirect = initLightingPart();
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

// fn any(value: vec3<f32>) -> bool {
//     return value.x != 0. || value.y != 0. || value.z != 0.;
// }

// Interleaved Gradient Noise for randomizing sampling patterns
fn interleavedGradientNoise(position: vec2<f32>) -> f32
{
    return fract(52.9829189 * fract(dot(position, vec2(0.06711056, 0.00583715))));
}

// Vogel disk sampling for uniform circular distribution
fn vogelDiskSample(sampleIndex: i32, samplesCount: i32, phi: f32) -> vec2<f32>
{
    let goldenAngle = 2.399963229728653;
    let r = sqrt( ( f32( sampleIndex ) + 0.5 ) / f32( samplesCount ) );
    let theta = f32( sampleIndex ) * goldenAngle + phi;
    return vec2( cos( theta ), sin( theta ) ) * r;
}

fn sample_shadow(uv: vec2<f32>, cmp: f32, fragCoord: vec2<f32>) -> f32
{
    var shadow = 0.;
    let bias = 0.0005;
    // todo: vsm
    if(SHADOWMAP_TYPE == SHADOW_TYPE_PCF){
        // sample along a rectangle pattern around center:
        // for(var x = -1; x <= 1; x++){
        //     for(var y = -1; y <= 1; y++){
        //         let offset = vec2<f32>(f32(x), f32(y)) / shadow_atlas_resolution;
        //         shadow += textureSampleCompare(
        //             shadowAtlasTexture,
        //             sampler_cmp_depth,
        //             uv + offset,
        //             cmp - bias
        //         );
        //     }
        // }
        // shadow = shadow / 9.0;

    // Hardware PCF with LinearFilter gives us 4-tap filtering per sample
    // 5 samples using Vogel disk + IGN = effectively 20 filtered taps with better distribution
        let shadowRadius = 1.f;

        let texelSize = vec2(1.0) / shadow_atlas_resolution;
        let radius = shadowRadius * texelSize.x;

        // Use IGN to rotate sampling pattern per pixel
        let phi = interleavedGradientNoise(fragCoord) * PI2;

        shadow = (
            textureSampleCompare( shadowAtlasTexture, sampler_cmp_depth, uv + vogelDiskSample( 0, 5, phi ) * radius, cmp-bias) +
            textureSampleCompare( shadowAtlasTexture, sampler_cmp_depth, uv + vogelDiskSample( 1, 5, phi ) * radius, cmp-bias) +
            textureSampleCompare( shadowAtlasTexture, sampler_cmp_depth, uv + vogelDiskSample( 2, 5, phi ) * radius, cmp-bias) +
            textureSampleCompare( shadowAtlasTexture, sampler_cmp_depth, uv + vogelDiskSample( 3, 5, phi ) * radius, cmp-bias) +
            textureSampleCompare( shadowAtlasTexture, sampler_cmp_depth, uv + vogelDiskSample( 4, 5, phi ) * radius, cmp-bias)
        ) * 0.2;
    }
    else if(SHADOWMAP_TYPE == SHADOW_TYPE_VSM){

    }
    else{
        shadow = textureSampleCompare(shadowAtlasTexture, sampler_cmp_depth, uv, cmp - bias);
    }

    return shadow;
}

// This is used to clamp the uvs to last texel center to avoid sampling on the border and overfiltering into a different shadow
fn shadow_border_shrink(light: LightData, shadow_uv: vec2<f32>) -> vec2<f32>
{
    let shadow_resolution = light.shadowAtlasMulAdd.xy * shadow_atlas_resolution;
    var border_size = 1.5;
// if(DISABLE_SOFT_SHADOWMAP){
//     border_size = 0.5;
// }
    return clamp(shadow_uv * shadow_resolution, vec2(border_size), shadow_resolution - border_size) / shadow_resolution;
}

fn shadow_2D(light: LightData, shadow_pos: vec3<f32>, shadow_uv: vec2<f32>, cascade: u32, fragCoord: vec2<f32>) -> f32
{
    var uv = shadow_border_shrink(light, shadow_uv);
    uv.x += f32(cascade);
    uv = uv * light.shadowAtlasMulAdd.xy + light.shadowAtlasMulAdd.zw;
    return sample_shadow(uv, shadow_pos.z, fragCoord);
}

fn clipspace_to_uv(clipspace: vec3<f32>) -> vec3<f32>
{
    return clipspace * vec3(0.5, -0.5, 1.) + vec3(0.5, 0.5, 0.);
}

fn isSaturated(v: vec3<f32>) -> bool {
    return all(v >= vec3<f32>(0.0)) && all(v <= vec3<f32>(1.0));
}

fn light_directional(NdotH: f32, NdotV: f32, NdotL: f32, lightData: LightData,
    F: vec3<f32>, roughness: f32, world_pos: vec3<f32>, fragCoord: vec2<f32>) -> LightingPart
{
    var directLight = initLightingPart();

    var shadow = 1.;

    // todo: cascade more than one
    for(var cascade = 0; cascade< i32(lightData.params.z); cascade++){
        let shadow_pos = (lightData.matrix * vec4(world_pos, 1)).xyz;
        let shadow_uv = clipspace_to_uv(shadow_pos);

        let shadow_main = shadow_2D(lightData, shadow_pos, shadow_uv.xy, u32(cascade), fragCoord);
        if(isSaturated(shadow_uv)){
            shadow *= shadow_main;
        }
        break;
    }

    if(NdotL > 0 && shadow > 0.){
        let lightColor = lightData.color.rgb * shadow;

        directLight.diffuse = lightColor * BRDF_GetDiffuse(F, NdotL);

        // let metalness= .5f;
        // var new_roughness = (1.0-metalness)*pow(roughness,0.4);
        // new_roughness += metalness*pow(roughness,1.2);

        directLight.specular = lightColor * BRDF_GetSpecular(roughness, F, NdotH, NdotV, NdotL);
    }

    return directLight;
}

fn light_spot() -> LightingPart
{
    var directLight = initLightingPart();

    return directLight;
}

fn light_point() -> LightingPart
{
    var directLight = initLightingPart();

    return directLight;
}

fn saturate(x: f32) -> f32
{
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

fn F_Schlick(f0: vec3<f32>, VoH: f32) -> vec3<f32>
{
  // Schlick 1994, "An Inexpensive BRDF Model for Physically-Based Rendering"
    let f90 = saturate(50.0 * dot(f0, vec3(0.33))); // reflectance at grazing angle
    return f0 + (f90 - f0) * pow(1.0 - VoH, 5);
}

fn forwardLighting(N:vec3<f32>, V: vec3<f32>, NdotV: f32, f0: vec3<f32>, roughness: f32,
    world_pos: vec3<f32>, fragCoord: vec2<f32>) -> LightingPart{
    var directLight = initLightingPart();
    let light_count = 64u;

    let F = EnvBRDFApprox(f0, roughness, NdotV);

    for (var i = 0u; i < light_count; i++) {
        let light = lights[i];

        let L = normalize(light.direction.xyz);
        let H = normalize(-L + V);

        var NdotL = saturate(dot(-L, N));
        var NdotH = saturate(dot(N, H));
        let LdotH = saturate(dot(-L, H));
        let VdotH = saturate(dot(V, H));

        if(CARTOON){
            NdotL = smoothstep(0.005, 0.05, NdotL);
            NdotH = smoothstep(0.98, 0.99, NdotH);
        }

        if(light.params.x == 1)
        {
            var res = initLightingPart();
            switch (u32(light.params.y)){
                case LIGHT_TYPE_DIRECTIONAL {
                    res = light_directional(NdotH, NdotV, NdotL, light, F, roughness, world_pos, fragCoord);

                    if(CARTOON){
                        let fresnelCol = vec3(0.3335, 0.9020, 3.4120);

                        let dotNL_reflect_faker = 1.-smoothstep(0.,0.3, dot(-L, N));

                        var fresnelTerm = dot(V, N);
                        fresnelTerm = clamp(1.0 - fresnelTerm, 0., 1.) * dotNL_reflect_faker;
                        // res.diffuse += fresnelCol*pow(fresnelTerm,5.)*0.8;
                        // res.diffuse = vec3(dotNL_reflect_faker);
                    }
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

    return vec4(color * diffuse + specular + emissive, 1.f);
}

fn EnvironmentReflection_Global(R: vec3<f32>, F:vec3<f32>, roughness: f32) -> vec3<f32>
{
    let mips = textureNumLevels(cubemap);
    let maxMip = f32(mips - 1);
    let mip = roughness * maxMip;
    return (textureSampleLevel(cubemap, linearSampler, R, mip).rgb) * F;
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
    let normalmap = textureSample(normalTexture, anisoSampler, uv);
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
    let diffuse = textureSample(diffuseTexture, anisoSampler, input.uv) * material.baseColor;

    let emissive = textureSample(emissiveTexture, linearSampler, input.uv).rgb;

    let normal = normalize(select(-input.normal, input.normal, input.isFrontFace));

    var T = select(-input.tangent.xyz, input.tangent.xyz, input.isFrontFace);
    T = normalize(T);
    let B = normalize(cross(T, normal) * input.tangent.w);
    let TBN = mat3x3<f32>(T, B, normal);

    var N = applyNormalMap(input.uv, TBN, normal);
    N = normal;

    let surfaceMap = textureSample(metallicRoughnessTexture, anisoSampler, input.uv);
    let roughness = surfaceMap.g * material.roughness;
    let metalness = surfaceMap.b * material.metalness;
    let reflectance = 0.04f;
    let albedo = diffuse.rgb * (1.f - max(reflectance, metalness));
    let f0 = mix(vec3(reflectance), diffuse.rgb, metalness);

    let occlusion = textureSample(occlusionTexture, linearSampler, input.uv).r;

    var lighting = initLighting();

    let ambient = getAmbient(N);
    lighting.indirect.diffuse = ambient;

    var V = cameraPos - input.world_pos;
    let dist = length(V);
    V /= dist;

    let R = -reflect(V, N);

    let NdotV = saturate(dot(N, V) + 1e-5);

    var F = vec3(1.);
    if(CARTOON){
        F = F_Schlick(f0, NdotV);
    }else{
        F = env_brdf_approx(f0, roughness, NdotV);
    }

    let envmapAccumulation = EnvironmentReflection_Global(R, F, roughness);

    lighting.indirect.specular += max(vec3<f32>(0.), envmapAccumulation);

    let directLight = forwardLighting(N, V, NdotV, f0, roughness, input.world_pos, input.position.xy/screen_size);
    lighting.direct.diffuse = directLight.diffuse;
    lighting.direct.specular = directLight.specular;

    var color = applyLighting(lighting, albedo, emissive, F, occlusion);

    if(USE_FOG){
        var fogFactor = 0.;

        let fogDepth = -input.view_pos.z;
        let fogColor = vec3(0.2196, 0.6039, 0.9490);
        let fogNear = 5000.;
        let fogFar = 10000.;
        let fogDensity = 0.00025;

        if(FOG_EXP2){
            fogFactor = 1.0 - exp(-fogDensity * fogDensity * fogDepth * fogDepth );
        }else{
            fogFactor = smoothstep( fogNear, fogFar, fogDepth );
        }

        let c = mix( color.rgb, fogColor, fogFactor );
        color = vec4(c.rgb, color.a);
    }

    return color;
    // return vec4(lighting.direct.diffuse,1.);
}
