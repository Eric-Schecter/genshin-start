import { query } from 'bitecs';
import { scene } from '../scene';
import { mat3, mat4 } from 'gl-matrix';
import { invalid_id } from '../constant';

export class TransformSystem {
    private _res = 0;

    public update(): number {
        this._res = 0;

        this._updateLocalMatrix();
        this._updateWorldMatrix();

        return this._res;
    }

    private _updateLocalMatrix() {
        const { hierarchies, transforms } = scene.components;

        for (const entity of query(scene, [hierarchies, transforms])) {
            const transformComponent = transforms[entity];
            if (!transformComponent.dirty) {
                continue;
            }

            mat4.fromRotationTranslationScale(
                transformComponent.localMatrix,
                transformComponent.rotation,
                transformComponent.translation,
                transformComponent.scale);
        }
    }

    private _updateWorldMatrix() {
        const { transforms, hierarchies } = scene.components;

        // for (const entity of query(scene, [transforms])) {
        //     const transformComponent = transforms[entity];
        //     if (!transformComponent.dirty) {
        //         continue;
        //     }

        //     mat4.copy(transformComponent.worldMatrix, transformComponent.localMatrix);
        // }
        // return;

        // mark dirty for children
        const dirtyEntityMap: [number, number][] = [];
        const normalEntities = new Set<number>();

        for (const entity of query(scene, [hierarchies, transforms])) {
            if (!transforms[entity].dirty) {
                normalEntities.add(entity);
            } else {
                dirtyEntityMap.push([hierarchies[entity].layer, entity]);
            }
        }

        if (dirtyEntityMap.length === 0) {
            // todo: update world matrix for pre world matrix
            return;
        }

        for (const entity of query(scene, [hierarchies, transforms])) {
            if (transforms[entity].dirty) {
                continue;
            }

            const hierarchyComponent = hierarchies[entity];
            let parent = hierarchyComponent.parent;
            while (parent !== invalid_id) {
                if (transforms[parent].dirty) {
                    dirtyEntityMap.push([hierarchyComponent.layer, entity]);
                    normalEntities.delete(entity);
                }
                parent = hierarchies[parent].parent;
            }
        }

        // update world matrix
        dirtyEntityMap.sort((a, b) => a[0] - b[0]);

        for (const [_, entity] of dirtyEntityMap) {
            const transformComponent = transforms[entity];
            const { parent } = hierarchies[entity];

            let worldMatrix = mat4.clone(transformComponent.localMatrix);
            if (parent !== invalid_id && transforms[parent]) {
                mat4.mul(worldMatrix, transforms[parent].worldMatrix, worldMatrix);
            }

            mat4.copy(transformComponent.worldMatrix, worldMatrix);
            transformComponent.normalMatrix = this._mat3ToMat4(mat3.normalFromMat4(mat3.create(), worldMatrix));

            // todo: update pre worldmatrix
        }

        for (const entity of query(scene, [hierarchies, transforms])) {
            transforms[entity].dirty = false;
        }

        // todo: update world matrix for pre world matrix


        this._res = 1;
    }

    private _mat3ToMat4(mat3: mat3) {
        const result = mat4.create();

        result[0] = mat3[0];
        result[1] = mat3[1];
        result[2] = mat3[2];
        result[3] = 0;

        result[4] = mat3[3];
        result[5] = mat3[4];
        result[6] = mat3[5];
        result[7] = 0;

        result[8] = mat3[6];
        result[9] = mat3[7];
        result[10] = mat3[8];
        result[11] = 0;

        result[12] = 0;
        result[13] = 0;
        result[14] = 0;
        result[15] = 1;

        return result;
    }
}
