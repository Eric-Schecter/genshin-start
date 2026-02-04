import {
    EN_BIND_FLAG, EN_FORMAT, EN_RESOURCE_MISC_FLAG, EN_RESOURCE_STATE, EN_TEX_TYPE, EN_USAGE, getFormatStride,
    GraphicsDevice, SubresourceData, TextureDesc
} from "@eric-schecter/graphics";
import Color, { ColorInstance } from "color";
import { mat3, vec3 } from "gl-matrix";

export class BackGround {
    public constructor(private readonly _graphicsDevice: GraphicsDevice) { }

    public create() {
        const width = 1;
        const height = window.innerHeight;
        const colorT = new Color().hex('#001c54');
        const colorTB = new Color().hex('#023fa1');
        const colorB = new Color().hex('#26a8ff');

        const desc: TextureDesc = {
            type: EN_TEX_TYPE.TEXTURE_2D,
            width,
            height,
            depth: 1,
            arraySize: 1,
            mipLevels: 1,
            format: EN_FORMAT.R32G32B32A32_FLOAT,
            sampleCount: 1,
            usage: EN_USAGE.DEFAULT,
            bindFlags: EN_BIND_FLAG.SHADER_RESOURCE,
            miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
            clear: {},
            layout: EN_RESOURCE_STATE.SHADER_RESOURCE,
            name: 'sky',
        };

        const tb_l = 0.2;
        const b_l = 0.6;

        const rgba = new Float32Array(width * height * 4);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = (y * width + x) * 4;
                let l = 1 - y / (height - 1);
                let t = 1 - this._smoothstep(0, tb_l, l);
                let tb = this._smoothstep(0, tb_l, l) * (1 - this._smoothstep(tb_l, b_l, l));
                let b = Math.pow(this._smoothstep(tb_l, b_l, l), 1);
                let color = Color.rgb(
                    Math.min(t * colorT.red() + tb * colorTB.red() + b * colorB.red(), 100000),
                    Math.min(t * colorT.green() + tb * colorTB.green() + b * colorB.green(), 100000),
                    Math.min(t * colorT.blue() + tb * colorTB.blue() + b * colorB.blue(), 100000)
                );
                const colorAcesInv = this.Color_ACES_Inv(color);

                rgba[index] = colorAcesInv[0];
                rgba[index + 1] = colorAcesInv[1];
                rgba[index + 2] = colorAcesInv[2];
                rgba[index + 3] = 1;
            }
        }

        const data: SubresourceData = {
            dataPtr: rgba,
            rowRitch: width * getFormatStride(desc.format),
            slicePitch: 0
        };
        return this._graphicsDevice.createTexture(desc, [data]);
    }

    public _smoothstep(edge0: number, edge1: number, x: number): number {
        const t = Math.max(0, Math.min((x - edge0) / (edge1 - edge0), 1));

        return t //* t * (3 - 2 * t);
    }

    private inv_rrt_odt_fit(v: number): number {
        const a = -(Math.sqrt(10) * Math.sqrt((-187248350 * Math.pow(v, 2)) + 232585567 * v + 241290) + 21650 * v - 1230);
        const b = (98370 * v - 100000);
        return a / b;
    }

    private ACES_Inv(color: vec3): vec3 {
        const ACES_INPUT_MAT = mat3.fromValues(
            1.76474, -0.14702, -0.03633,
            -0.67577, 1.16025, -0.16243,
            -0.08896, -0.01322, 1.19877
        );

        const ACES_OUTPUT_MAT = mat3.fromValues(
            0.64304, 0.05926, 0.00596,
            0.31119, 0.93144, 0.06393,
            0.04578, 0.00929, 0.93012
        );

        const result = vec3.clone(color);

        vec3.transformMat3(result, result, ACES_OUTPUT_MAT);

        result[0] = this.inv_rrt_odt_fit(result[0]);
        result[1] = this.inv_rrt_odt_fit(result[1]);
        result[2] = this.inv_rrt_odt_fit(result[2]);

        vec3.transformMat3(result, result, ACES_INPUT_MAT);

        return Array.from(result);
    }

    private Color_ACES_Inv(color: ColorInstance) {
        let p = vec3.fromValues(color.red() / 255, color.green() / 255, color.blue() / 255);
        return this.ACES_Inv(p);
    }

}
