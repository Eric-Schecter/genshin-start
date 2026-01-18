import { quat, vec3 } from "gl-matrix";
import { MashList } from "./datas";
import { clone, getEntityByTag, getPrimaryCamera, invalid_id, scene } from "./renderer";
import { query } from "bitecs";
import { zLength } from "./constant";

export class Column {
    private _prefab = new Map<string, number>(); // not real prefab

    private _markedObj = new Set<string>();

    public onload() {
        for (let i = 0; i < MashList.length; i++) {
            const { Object } = MashList[i];
            const entity = getEntityByTag(Object);
            if (!this._prefab.has(Object)) {
                this._prefab.set(Object, entity);
            }
        }
        for (let i = 0; i < MashList.length; i++) {
            const { Object, Scale, Location, Rotation } = MashList[i];
            const entity = this._prefab.get(Object);
            if (!entity || entity === invalid_id) {
                console.error(`can not find model:${Object}`);
                continue;
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
            if (parent !== invalid_id && this._markedObj.has(tags[parent].tag) &&
                transforms[entity].translation[2] > cameraCenter[2] + 2000) {
                transforms[entity].translation[2] -= zLength * 0.1;
                transforms[entity].dirty = true;
            }
        }
    }
}
