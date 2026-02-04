import { EN_BIND_FLAG, EN_RESOURCE_MISC_FLAG, EN_USAGE, GPUBufferDesc, GraphicsDevice } from "@eric-schecter/graphics";
import { vec3, mat4, vec4, vec2, quat } from "gl-matrix";
import { createDefaultTextureData, EN_COLOR_SPACE } from "./ecs";

export function setupUniformBuffer(graphicsDevice: GraphicsDevice, data: number[], name = '') {
    const color = new Float32Array(data);
    const desc: GPUBufferDesc = {
        size: color.byteLength,
        name,
        usage: EN_USAGE.DEFAULT,
        bindFlags: EN_BIND_FLAG.CONSTANT_BUFFER,
        miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
        stride: 0,
        count: color.byteLength / Float32Array.BYTES_PER_ELEMENT,
    }
    return graphicsDevice.createBuffer(desc, color);
}

export function quatToMat4(quat: quat) {
    const mat = mat4.create();
    mat4.fromQuat(mat, quat);
    return mat;
}

export function getUp(mat: mat4) {
    return vec3.fromValues(mat[4], mat[5], mat[6]);
}

export function getForward(mat: mat4) {
    return vec3.fromValues(-mat[8], -mat[9], -mat[10]);
}

export function getPos(mat: mat4) {
    return vec3.fromValues(mat[12], mat[13], mat[14]);
}

function calculateFallbackTangent(faceNormal: vec3): vec3 {
    const tangent = vec3.create();

    if (Math.abs(faceNormal[0]) > 0.1 || Math.abs(faceNormal[2]) > 0.1) {
        vec3.cross(tangent, [0, 1, 0], faceNormal);
    } else {
        vec3.cross(tangent, [1, 0, 0], faceNormal);
    }

    if (vec3.length(tangent) > 1e-8) {
        vec3.normalize(tangent, tangent);
    } else {
        console.warn('generate tangent failed');
        vec3.set(tangent, 1, 0, 0);
    }

    return tangent;
}

export function generateTangentData(
    positions: vec3[],
    normals: vec3[],
    uvs: vec2[],
    indices: number[]
): vec4[] {
    const tangents: vec4[] = new Array(positions.length)
        .fill(0)
        .map(() => vec4.create());

    for (let i = 0; i < indices.length; i += 3) {
        const i0 = indices[i + 0];
        const i1 = indices[i + 1];
        const i2 = indices[i + 2];

        const v0 = positions[i0];
        const v1 = positions[i1];
        const v2 = positions[i2];

        let uv0 = vec2.clone(uvs[i0]);
        let uv1 = vec2.clone(uvs[i1]);
        let uv2 = vec2.clone(uvs[i2]);

        uv0[1] *= -1;
        uv1[1] *= -1;
        uv2[1] *= -1;

        const n0 = normals[i0];
        const n1 = normals[i1];
        const n2 = normals[i2];

        const facenormal = vec3.create();
        vec3.add(facenormal, n0, n1);
        vec3.add(facenormal, facenormal, n2);
        vec3.normalize(facenormal, facenormal);

        const e1 = vec3.create();
        const e2 = vec3.create();
        vec3.subtract(e1, v1, v0);
        vec3.subtract(e2, v2, v0);

        const s1 = uv1[0] - uv0[0];
        const s2 = uv2[0] - uv0[0];
        const t1 = uv1[1] - uv0[1];
        const t2 = uv2[1] - uv0[1];

        const denom = s1 * t2 - s2 * t1;
        if (Math.abs(denom) < 1e-8) {
            // console.warn('Denom is zero when generating tangents');
            const tangent = calculateFallbackTangent(facenormal);
            const t = vec4.fromValues(tangent[0], tangent[1], tangent[2], 1.0);

            for (const idx of [i0, i1, i2]) {
                vec4.add(tangents[idx], tangents[idx], t);
            }
            continue;
        }

        const r = 1.0 / denom;

        const sdir = vec3.create();
        const tdir = vec3.create();

        const tmp1 = vec3.create();
        const tmp2 = vec3.create();
        vec3.scale(tmp1, e1, t2);
        vec3.scale(tmp2, e2, t1);
        vec3.subtract(sdir, tmp1, tmp2);
        vec3.scale(sdir, sdir, r);

        vec3.scale(tmp1, e2, s1);
        vec3.scale(tmp2, e1, s2);
        vec3.subtract(tdir, tmp1, tmp2);
        vec3.scale(tdir, tdir, r);

        const tangent = vec3.create();
        const dot = vec3.dot(facenormal, sdir);
        vec3.scale(tmp1, facenormal, dot);
        vec3.subtract(tangent, sdir, tmp1);
        vec3.normalize(tangent, tangent);

        const cross = vec3.create();
        vec3.cross(cross, tangent, facenormal);
        const sign = vec3.dot(cross, tdir) < 0 ? -1 : 1;

        const t = vec4.fromValues(tangent[0], tangent[1], tangent[2], sign);

        for (const idx of [i0, i1, i2]) {
            vec4.add(tangents[idx], tangents[idx], t);
        }
    }

    for (let i = 0; i < tangents.length; i++) {
        const t = tangents[i];
        const tangentVec = vec3.fromValues(t[0], t[1], t[2]);
        vec3.normalize(tangentVec, tangentVec);
        tangents[i] = vec4.fromValues(tangentVec[0], tangentVec[1], tangentVec[2], t[3]);
    }

    return tangents;
}

export function vec4ArrayToFloat32Array(tangents: vec4[]): Float32Array<ArrayBuffer> {
    const arr = new Float32Array(tangents.length * 4);
    for (let i = 0; i < tangents.length; i++) {
        arr[i * 4 + 0] = tangents[i][0];
        arr[i * 4 + 1] = tangents[i][1];
        arr[i * 4 + 2] = tangents[i][2];
        arr[i * 4 + 3] = tangents[i][3];
    }
    return arr;
}

export function createTexture(imageData?: Uint8Array | null, size?: [number, number] | null, name?: string, colorSpace = EN_COLOR_SPACE.LINEAR) {
    const res = createDefaultTextureData();
    if (!imageData) {
        return res;
    }
    if (!size) {
        throw new Error('get image size failed');
    }
    const [width, height] = size;

    res.width = width;
    res.height = height;
    res.data = imageData;
    res.name = name || '';
    res.colorSpace = colorSpace;

    return res;
}
