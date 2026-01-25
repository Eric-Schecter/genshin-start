import { Rect } from "@eric-schecter/graphics";
import { mat4, vec3, vec4 } from "gl-matrix";

export enum EN_LIGHT_TYPE {
    AMBIENT,
    DIRECTIONAL,
    SPOT,
    POINT,
}

export type LightComponent = {
    type: EN_LIGHT_TYPE;
    color: vec3;
    intensity: number;

    castShadow: boolean;
    cameras: number[];
    matrix: mat4;
    shadowAtlasMulAdd: vec4;
    shadowRect: {
        width: number,
        height: number,
        x: number,
        y: number,
    };
    cascadeCount: number;

    dirty: boolean;
}

export const creaetDefaultLightComponent = (): LightComponent => {
    return {
        type: EN_LIGHT_TYPE.POINT,
        color: vec3.fromValues(1, 1, 1),
        intensity: 1,

        castShadow: true,
        cameras: [],
        matrix: mat4.create(),
        shadowAtlasMulAdd: vec4.fromValues(1, 1, 0, 0),
        shadowRect: { width: 0, height: 0, x: 0, y: 0 },
        cascadeCount: 1,

        dirty: true,
    }
}
