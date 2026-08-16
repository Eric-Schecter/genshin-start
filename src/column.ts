import { quat, vec3 } from "gl-matrix";
import { MashList } from "./datas";
import { clone, getEntityByTag, getPrimaryCamera, invalid_id, scene } from "@eric-schecter/renderer";
import { query } from "bitecs";
import { zLength } from "./constant";

export class Column {
    private readonly _prefab = new Map<string, number>(); // not real prefab

    private readonly _markedObj = new Set<string>();

    public onload() {
        for (const element of MashList) {
            const { Object } = element;
            const entity = getEntityByTag(Object);
            if (!this._prefab.has(Object)) {
                this._prefab.set(Object, entity);

                const { objects, meshes, materials, hierarchies } = scene.components;
                for (const childEntity of query(scene, [hierarchies])) {
                    const hierarchyComponent = hierarchies[childEntity];
                    if (hierarchyComponent.parent === entity) {
                        const meshEntities = objects[childEntity].meshEntities;
                        for (const meshEntity of meshEntities) {
                            const [materialEntity] = meshes[meshEntity].materialEntity;
                            const material = materials[materialEntity];
                            material.metallicFactor = 0.3;
                            material.dirty = true;
                        }
                    }
                }
            }
        }
        for (const element of MashList) {
            const { Object, Scale, Location, Rotation } = element;
            const entity = this._prefab.get(Object);
            if (!entity || entity === invalid_id) {
                console.error(`can not find model:${Object}`);
            }
            else {
                const clonedEntity = this._markedObj.has(Object) ? clone(entity) : entity;
                const { transforms, hierarchies } = scene.components;

                for (const entity of query(scene, [hierarchies])) {
                    const hierarchyComponent = hierarchies[entity];
                    if (hierarchyComponent.parent === clonedEntity) {
                        const transformComponent = transforms[entity];
                        transformComponent.scale = vec3.scale(vec3.create(), vec3.fromValues(Scale[0], Scale[2], Scale[1]), 0.1);
                        transformComponent.translation = vec3.scale(vec3.create(), vec3.fromValues(Location[0], Location[2], -Location[1]), 0.1);
                        transformComponent.rotation = quat.fromEuler(quat.create(), Rotation[0] / Math.PI * 180, Rotation[2] / Math.PI * 180, Rotation[1] / Math.PI * 180, 'xyz');
                        transformComponent.dirty = true;
                    }
                }
                this._markedObj.add(Object);
            }
        }
    }

    public update(dt: number) {
        const { tags, hierarchies, transforms } = scene.components;
        const cameraEntity = getPrimaryCamera();
        const cameraCenter = transforms[cameraEntity].translation;
        for (const entity of query(scene, [tags, hierarchies, transforms])) {
            const { parent } = hierarchies[entity];
            if (parent !== invalid_id && this._markedObj.has(tags[parent].tag)) {
                // const worldPos = mat4.getTranslation(vec3.create(), transforms[entity].worldMatrix);
                if (transforms[entity].translation[2] > cameraCenter[2] + 2000) {
                    transforms[entity].translation[2] -= zLength * 0.1;
                    transforms[entity].dirty = true;
                }
            }
        }
    }
}
