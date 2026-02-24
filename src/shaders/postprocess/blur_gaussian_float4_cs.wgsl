
override BILATERAL: bool = false;
override BLUR_WIDE: bool = true; // todo: not support false for now

const GAUSS_KERNEL = 33u;
const GAUSS_KERNEL_SMALL = 9u;
const TILE_BORDER = 16u;  // GAUSS_KERNEL / 2
const TILE_BORDER_SMALL = 4u;  // GAUSS_KERNEL_SMALL / 2
const POSTPROCESS_BLUR_GAUSSIAN_THREADCOUNT = 256u;
const CACHE_SIZE = TILE_BORDER + POSTPROCESS_BLUR_GAUSSIAN_THREADCOUNT + TILE_BORDER;

var<private> gaussianWeightsNormalized_wide: array<f32, 33> = array<f32, 33>(
    0.004013, 0.005554, 0.007527, 0.00999, 0.012984,
    0.016524, 0.020594, 0.025133, 0.030036, 0.035151,
    0.040283, 0.045207, 0.049681, 0.053463, 0.056341,
    0.058141, 0.058754, 0.058141, 0.056341, 0.053463,
    0.049681, 0.045207, 0.040283, 0.035151, 0.030036,
    0.025133, 0.020594, 0.016524, 0.012984, 0.00999,
    0.007527, 0.005554, 0.004013
);

var<private> gaussianOffsets_wide: array<i32, 33> = array<i32, 33>(
    -16, -15, -14, -13, -12, -11, -10, -9, -8, -7, -6,
    -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    10, 11, 12, 13, 14, 15, 16
);

var<private> gaussianWeightsNormalized_narrow: array<f32, 9> = array<f32, 9>(
    0.004112, 0.026563, 0.100519, 0.223215, 0.29118,
    0.223215, 0.100519, 0.026563, 0.004112
);

var<private> gaussianOffsets_narrow: array<i32, 9> = array<i32, 9>(
    -4, -3, -2, -1, 0, 1, 2, 3, 4
);

struct PostProcess
{
    resolution:vec2<f32>,
    resolution_rcp:vec2<f32>,
    params:vec4<f32>, // xy = direction, z = camera zFar, w = depth threshold for bilateral
};

@group(0) @binding(0) var input_tex: texture_2d<f32>;
@group(0) @binding(1) var output_tex: texture_storage_2d<rgba32float, write>;
@group(0) @binding(2) var sampler_linear_clamp: sampler;
@group(0) @binding(3) var sampler_point_clamp: sampler;
@group(0) @binding(4) var texture_lineardepth: texture_2d<f32>;
@group(0) @binding(5) var<uniform> postprocess: PostProcess;

var<workgroup> color_cache: array<vec4<f32>, CACHE_SIZE>;
// #ifdef BILATERAL
var<workgroup> depth_cache: array<f32, CACHE_SIZE>;
// #endif

@compute @workgroup_size(POSTPROCESS_BLUR_GAUSSIAN_THREADCOUNT, 1, 1)
fn main(@builtin(workgroup_id) Gid: vec3<u32>, @builtin(local_invocation_index) groupIndex: u32, @builtin(global_invocation_id) DTid: vec3<u32>) {
    let direction = postprocess.params.xy;
    let horizontal = direction.y == 0.0;

    var tile_start = Gid.xy;
    if (horizontal) {
        tile_start.x = tile_start.x * POSTPROCESS_BLUR_GAUSSIAN_THREADCOUNT;
    } else {
        tile_start.y = tile_start.y * POSTPROCESS_BLUR_GAUSSIAN_THREADCOUNT;
    }

    for (var i = groupIndex; i < CACHE_SIZE; i += POSTPROCESS_BLUR_GAUSSIAN_THREADCOUNT) {
        let uv = (vec2<f32>(tile_start) + vec2(0.5) + direction * f32(i32(i) - i32(TILE_BORDER))) * postprocess.resolution_rcp;
        color_cache[i] = textureSampleLevel(input_tex, sampler_linear_clamp, uv, 0.0);

        if(BILATERAL){
            depth_cache[i] = textureSampleLevel(texture_lineardepth, sampler_point_clamp, uv, 0.0).r;
        }
    }

    workgroupBarrier();

    var pixel = tile_start;
    if (horizontal) {
        pixel.x = tile_start.x + groupIndex;
    } else {
        pixel.y = tile_start.y + groupIndex;
    }

    if (pixel.x >= u32(postprocess.resolution.x) || pixel.y >= u32(postprocess.resolution.y)) {
        // textureStore(output_tex, DTid.xy, vec4(1.f));
        return;
    }
    //         let uv = vec2<f32>(DTid.xy) + vec2(0.5, 0.5);
    // let c =  textureSampleLevel(input_tex, sampler_linear_clamp, vec2<f32>(pixel), 0.0);
    // textureStore(output_tex,pixel, vec4(1.));
    // return;

    let center = TILE_BORDER + groupIndex;

    var depth_threshold: f32;
    var center_depth: f32;
    var center_color: vec4<f32>;
    if(BILATERAL){
        depth_threshold = postprocess.params.w;
        center_depth = depth_cache[center];
        center_color = color_cache[center];
    }

    var color: vec4<f32> = vec4<f32>(0.0);

    var kernel_size: u32;
    if(BLUR_WIDE){
        kernel_size = GAUSS_KERNEL;
    } else {
        kernel_size = GAUSS_KERNEL_SMALL;
    }

    for (var i = 0u; i < kernel_size; i += 1u) {
        var offset : i32;
        if(BLUR_WIDE){
            offset = gaussianOffsets_wide[i];
         } else{
            offset = gaussianOffsets_narrow[i];
         }
        let sam = u32(i32(center) + offset);
        let color2 = color_cache[sam];

        if(BILATERAL){
            let depth = depth_cache[sam];
            let weight = clamp(abs(depth - center_depth) * postprocess.params.z * depth_threshold, 0.0, 1.0);
            color += mix(color2, center_color, vec4<f32>(weight)) * gaussianWeightsNormalized_wide[i]; // todo: add narrow
        } else {
            color += color2 * gaussianWeightsNormalized_wide[i]; // todo: add narrow
        }
    }
    // color = vec4(1.f);

    textureStore(output_tex, vec2<i32>(pixel), color);
}
