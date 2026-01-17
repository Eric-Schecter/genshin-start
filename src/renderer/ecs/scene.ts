import { addComponent, addEntity, createWorld, hasComponent, query, } from "bitecs";
import {
    MaterialComponent, MeshComponent, ObjectComponent, TagComponent,
    TransformComponent, CameraComponent, HierarchyComponent,
} from "./components";
import { invalid_id } from "./constant";
import { mat4, quat, vec3 } from "gl-matrix";

export const scene = createWorld({
    components: {
        transforms: [] as TransformComponent[],
        meshes: [] as MeshComponent[],
        materials: [] as MaterialComponent[],
        objects: [] as ObjectComponent[],
        cameras: [] as CameraComponent[],
        hierarchies: [] as HierarchyComponent[],
        tags: [] as TagComponent[],
    }
});

export function clone(entity: number) {
    const { transforms, cameras, tags, hierarchies, objects, materials, meshes } = scene.components;
    const clonedEntity = addEntity(scene);
    if (hasComponent(scene, entity, cameras)) {
        addComponent(scene, clonedEntity, cameras);
        cameras[clonedEntity] = {
            ...cameras[entity], ...{
                viewMatrix: mat4.clone(cameras[entity].viewMatrix),
                projMatrix: mat4.clone(cameras[entity].projMatrix),
                inverse_view_projection: mat4.clone(cameras[entity].inverse_view_projection),
                viewMatrixBuffer: undefined,
                projMatrixBuffer: undefined,
                cameraPosBuffer: undefined,
                dirty: true,
            }
        };
    }
    if (hasComponent(scene, entity, transforms)) {
        addComponent(scene, clonedEntity, transforms);
        transforms[clonedEntity] = {
            ...transforms[entity], ...{
                translation: vec3.clone(transforms[entity].translation),
                rotation: quat.clone(transforms[entity].rotation),
                scale: vec3.clone(transforms[entity].scale),

                localMatrix: mat4.clone(transforms[entity].localMatrix),
                worldMatrix: mat4.clone(transforms[entity].worldMatrix),
                dirty: true,
            }
        };
    }
    if (hasComponent(scene, entity, tags)) {
        addComponent(scene, clonedEntity, tags);
        tags[clonedEntity] = { ...tags[entity] };
    }
    if (hasComponent(scene, entity, hierarchies)) {
        addComponent(scene, clonedEntity, hierarchies);
        hierarchies[clonedEntity] = { ...hierarchies[entity] };
    }
    if (hasComponent(scene, entity, objects)) {
        addComponent(scene, clonedEntity, objects);
        objects[clonedEntity] = {
            ...objects[entity],
            ...{ meshEntities: [...objects[entity].meshEntities] }
        };
    }
    if (hasComponent(scene, entity, materials)) {
        addComponent(scene, clonedEntity, materials);
        materials[clonedEntity] = { ...materials[entity] };
    }
    if (hasComponent(scene, entity, meshes)) {
        addComponent(scene, clonedEntity, meshes);
        meshes[clonedEntity] = { ...meshes[entity], ...{ bbox: meshes[entity].bbox.clone() } };
    }

    // clone children
    for (const childEntity of query(scene, [hierarchies])) {
        if (hierarchies[childEntity].parent === entity) {
            const clonedChildEntity = clone(childEntity);
            hierarchies[clonedChildEntity].parent = clonedEntity;
        }
    }

    return clonedEntity;
}

export function getPrimaryCamera() {
    const { cameras } = scene.components;
    for (const entity of query(scene, [cameras])) {
        const cameraComponent = cameras[entity];
        if (cameraComponent.isPrimary) {
            return entity;
        }
    }
    return invalid_id;
}

export function getEntityByTag(tag: string) {
    const { tags } = scene.components;
    for (const entity of query(scene, [tags])) {
        const tc = tags[entity];
        if (tc.tag === tag) {
            return entity;
        }
    }
    return invalid_id;
}

