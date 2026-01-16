import { GraphicsDevice } from '@eric-schecter/graphics';
import { query } from 'bitecs';
import { scene } from '../scene';
import { setupUniformBuffer } from '../../utils';
import { Controller } from '../../controller';
import { mat4 } from 'gl-matrix';

export class CameraSystem {
    public update(graphicsDevice: GraphicsDevice, controller: Controller, dt: number): number {
        let res = 0;

        const { cameras, transforms } = scene.components;

        for (const entity of query(scene, [cameras, transforms])) {
            const cameraComponent = cameras[entity];
            if (!cameraComponent.viewMatrixBuffer) {
                cameraComponent.viewMatrixBuffer = setupUniformBuffer(graphicsDevice, Array.from(mat4.create()), 'view matrix');
            }
            if (!cameraComponent.projMatrixBuffer) {
                cameraComponent.projMatrixBuffer = setupUniformBuffer(graphicsDevice, Array.from(cameraComponent.projMatrix), 'proj matrix');
            }
            if (!cameraComponent.cameraPosBuffer) {
                // todo: use transform component
                cameraComponent.cameraPosBuffer = setupUniformBuffer(graphicsDevice, Array.from(controller.pos), 'camera pos');
            }
            // todo
            if (!cameraComponent.isPrimary) {
                continue;
            }

            if (cameraComponent.dirty) {
                const { fov, aspect, near, far } = cameraComponent;
                cameraComponent.projMatrix = mat4.perspectiveZO(cameraComponent.projMatrix, fov, aspect, near, far);
                cameraComponent.projMatrixBuffer.update(new Float32Array(cameraComponent.projMatrix));
                cameraComponent.dirty = false;

                res = 1;
            }

            if (controller.dirty) {
                const view = controller.getMatrix(dt);

                const transformComponent = transforms[entity];
                transformComponent.translation = controller.pos;
                transformComponent.rotation = controller.rotation;
                transformComponent.dirty = true;

                // todo
                cameraComponent.inverse_view_projection = mat4.invert(mat4.create(), mat4.mul(mat4.create(), cameraComponent.projMatrix, view)) || mat4.create();

                cameraComponent.viewMatrixBuffer.update(new Float32Array(view));
                cameraComponent.cameraPosBuffer.update(new Float32Array(controller.pos));

                res = 1;
            }
        }

        return res;
    }
}
