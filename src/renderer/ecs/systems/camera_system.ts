import { GraphicsDevice } from '@eric-schecter/graphics';
import { query } from 'bitecs';
import { getPrimaryCamera, scene } from '../scene';
import { setupUniformBuffer } from '../../utils';
import { Controller } from '../../controller';
import { mat4 } from 'gl-matrix';
import { EN_CAMERA_TYPE } from '../components';
import { invalid_id } from '../constant';

export class CameraSystem {
    public update(graphicsDevice: GraphicsDevice, controller: Controller, dt: number): number {
        let res = 0;

        const { cameras, transforms } = scene.components;

        for (const entity of query(scene, [cameras, transforms])) {
            const cameraComponent = cameras[entity];
            const transformComponent = transforms[entity];
            if (!cameraComponent.cameraPosBuffer) {
                cameraComponent.cameraPosBuffer = setupUniformBuffer(graphicsDevice, Array.from(transformComponent.translation), 'camera pos');
            }
        }

        for (const entity of query(scene, [cameras])) {
            const cameraComponent = cameras[entity];
            if (!cameraComponent.viewMatrixBuffer) {
                cameraComponent.viewMatrixBuffer = setupUniformBuffer(graphicsDevice, Array.from(mat4.create()), 'view matrix');
            }
            if (!cameraComponent.projMatrixBuffer) {
                cameraComponent.projMatrixBuffer = setupUniformBuffer(graphicsDevice, Array.from(cameraComponent.projMatrix), 'proj matrix');
            }

            if (cameraComponent.dirty) {
                const { fov, aspect, near, far, type, orthoHeight } = cameraComponent;
                if (type === EN_CAMERA_TYPE.PERSPECTIVE) {
                    cameraComponent.projMatrix = mat4.perspectiveZO(cameraComponent.projMatrix, fov, aspect, near, far);
                } else {
                    const halfH = orthoHeight * 0.5;
                    const halfW = halfH * aspect;
                    const left = -100;// -halfW;
                    const right = 400;// halfW;
                    const bottom = -100;//-halfH;
                    const top = 400;// halfH;

                    cameraComponent.projMatrix = mat4.orthoZO(cameraComponent.projMatrix, left, right, bottom, top, near, far);
                }
                cameraComponent.projMatrixBuffer.update(new Float32Array(cameraComponent.projMatrix));
                cameraComponent.dirty = false;

                res = 1;
            }
        }

        if (controller.dirty) {
            const primaryCameraEntity = getPrimaryCamera();
            if (primaryCameraEntity !== invalid_id) {
                const cameraComponent = cameras[primaryCameraEntity];

                const view = controller.getMatrix(dt);
                const transformComponent = transforms[primaryCameraEntity];
                transformComponent.translation = controller.pos;
                transformComponent.rotation = controller.rotation;
                transformComponent.dirty = true;

                // todo
                cameraComponent.inverse_view_projection = mat4.invert(mat4.create(), mat4.mul(mat4.create(), cameraComponent.projMatrix, view)) || mat4.create();

                cameraComponent.viewMatrixBuffer?.update(new Float32Array(view));
                cameraComponent.cameraPosBuffer?.update(new Float32Array(controller.pos));

                res = 1;
            }
        }


        return res;
    }
}
