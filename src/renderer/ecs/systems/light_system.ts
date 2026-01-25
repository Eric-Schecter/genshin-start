import { GraphicsDevice, WGPUTexture } from '@eric-schecter/graphics';
import { query } from 'bitecs';
import { scene } from '../scene';
import { mat4, vec3 } from 'gl-matrix';
import { EN_LIGHT_TYPE } from '../components';

export class LightSystem {
    private _defaultForward = vec3.fromValues(0, 0, -1);

    private _defaultUp = vec3.fromValues(0, 1, 0);

    public update(graphicsDevice: GraphicsDevice, shadowTexture?: WGPUTexture): number {
        let res = 0;
        if (!shadowTexture) {
            return res;
        }

        const { cameras, transforms, lights } = scene.components;
        const { desc: { width, height } } = shadowTexture;

        for (const entity of query(scene, [lights, transforms])) {
            const lightComponent = lights[entity];
            if (!lightComponent.dirty) {
                continue;
            }

            const transformComponent = transforms[entity];

            lightComponent.shadowAtlasMulAdd[0] = lightComponent.shadowRect.width / width;
            lightComponent.shadowAtlasMulAdd[1] = lightComponent.shadowRect.height / height;
            lightComponent.shadowAtlasMulAdd[2] = lightComponent.shadowRect.x / width;
            lightComponent.shadowAtlasMulAdd[3] = lightComponent.shadowRect.y / height;

            // todo: not consider hierachy for now
            switch (lightComponent.type) {
                case EN_LIGHT_TYPE.DIRECTIONAL: {
                    const [cameraEntity] = lightComponent.cameras;
                    const cameraComponent = cameras[cameraEntity];

                    const forward = vec3.transformQuat(vec3.create(), this._defaultForward, transformComponent.rotation);
                    const up = vec3.transformQuat(vec3.create(), this._defaultUp, transformComponent.rotation);
                    const center = vec3.add(vec3.create(), transformComponent.translation, forward);

                    mat4.lookAt(cameraComponent.viewMatrix, transformComponent.translation, center, up);
                    cameraComponent.viewMatrixBuffer?.update(new Float32Array(cameraComponent.viewMatrix));

                    mat4.mul(lightComponent.matrix, cameraComponent.projMatrix, cameraComponent.viewMatrix);

                    res = 1;
                    break;
                }
                case EN_LIGHT_TYPE.SPOT: {
                    console.warn('not implemeted');
                    // const [cameraEntity] = lightComponent.cameras;
                    // const cameraComponent = cameras[cameraEntity];

                    // res = 1;
                    break;
                }
                case EN_LIGHT_TYPE.POINT: {
                    console.warn('not implemeted');
                    // for (const cameraEntity of lightComponent.cameras) {
                    //     const cameraComponent = cameras[cameraEntity];

                    //     res = 1;
                    // }
                    break;
                }
            }

            // lightComponent.dirty = false;
        }

        return res;
    }
}
