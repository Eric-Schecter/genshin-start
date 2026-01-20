import { vec3 } from "gl-matrix";

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

    direction: vec3;

    dirty: boolean;
}

export const creaetDefaultLightComponent = (): LightComponent => {
    return {
        type: EN_LIGHT_TYPE.POINT,
        color: vec3.fromValues(1, 1, 1),
        intensity: 1,

        direction: vec3.fromValues(-1, -1, -1),

        dirty: true,
    }
}
