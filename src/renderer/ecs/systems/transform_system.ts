import { GraphicsDevice } from '@eric-schecter/graphics';
import { query } from 'bitecs';
import { scene } from '../scene';
import { setupUniformBuffer } from '../../utils';
import { mat4 } from 'gl-matrix';

export class TransformSystem {
    public update(graphicsDevice: GraphicsDevice): number {
        this._updateLocalMatrix();
        this._updateWorldMatrix();

        let res = 0;

        const { transforms } = scene.components;

        for (const entity of query(scene, [transforms])) {
            const transformComponent = transforms[entity];
            if (!transformComponent.dirty) {
                continue;
            }
            
            if (!transformComponent.modelMatrixBuffer) {
                transformComponent.modelMatrixBuffer = setupUniformBuffer(graphicsDevice, Array.from(transformComponent.worldMatrix), 'model matrix');
            } else {
                transformComponent.modelMatrixBuffer.update(new Float32Array(transformComponent.worldMatrix));
            }

            transformComponent.dirty = false;

            res = 1;
        }

        return res;
    }

    private _updateLocalMatrix() {
        const { transforms } = scene.components;

        for (const entity of query(scene, [transforms])) {
            const transformComponent = transforms[entity];
            if (!transformComponent.dirty) {
                continue;
            }

            mat4.fromRotationTranslationScale(
                transformComponent.worldMatrix,
                transformComponent.rotation,
                transformComponent.translation,
                transformComponent.scale);
        }
    }

    private _updateWorldMatrix() {

    }
}
