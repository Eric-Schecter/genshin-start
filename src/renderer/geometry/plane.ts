import { addComponent, addEntity } from "bitecs";
import {
    creaetDefaultTagComponent, creaetDefaultTransformComponent, createDefaultHierarchyComponent,
    createDefaultMaterialComponent, createDefaultMeshComponent, createDefaultObjectComponent, scene
} from "../ecs";
import { generateTangentData, vec4ArrayToFloat32Array } from "../utils";
import { vec2, vec3 } from "gl-matrix";

export class Plane {
    public static create() {
        const { objects, transforms, hierarchies, tags, meshes, materials } = scene.components;

        const entity = addEntity(scene);
        addComponent(scene, entity, objects);
        objects[entity] = createDefaultObjectComponent();

        addComponent(scene, entity, hierarchies);
        hierarchies[entity] = createDefaultHierarchyComponent();

        addComponent(scene, entity, transforms);
        transforms[entity] = creaetDefaultTransformComponent();

        addComponent(scene, entity, tags);
        tags[entity] = creaetDefaultTagComponent();
        tags[entity].tag = 'cloud';

        const meshEntity = addEntity(scene);
        const { positions, normals, uvs, indices } = this._createMeshData();
        addComponent(scene, meshEntity, meshes);
        meshes[meshEntity] = createDefaultMeshComponent();
        const meshComponent = meshes[meshEntity];
        meshComponent.positions = new Float32Array(positions.map(v => Array.from(v)).flat());
        meshComponent.normals = new Float32Array(normals.map(v => Array.from(v)).flat());
        meshComponent.uvs = new Float32Array(uvs.map(v => Array.from(v)).flat());
        meshComponent.indices = new Uint32Array(indices);
        meshComponent.tangents = vec4ArrayToFloat32Array(generateTangentData(positions, normals, uvs, indices));

        objects[entity].meshEntities.push(meshEntity);

        const materialEntity = addEntity(scene);
        addComponent(scene, materialEntity, materials);
        materials[materialEntity] = createDefaultMaterialComponent();

        meshComponent.materialEntity.push(materialEntity);

        return entity;
    }

    private static _createMeshData(width = 1, height = 1) {
        const halfWidth = width / 2;
        const halfHeight = height / 2;

        const positions = [
            vec3.fromValues(-halfWidth, -halfHeight, 0.0),
            vec3.fromValues(halfWidth, -halfHeight, 0.0),
            vec3.fromValues(halfWidth, halfHeight, 0.0),
            vec3.fromValues(-halfWidth, halfHeight, 0.0)
        ];

        const uvs = [
            vec2.fromValues(0.0, 1.0),
            vec2.fromValues(1.0, 1.0),
            vec2.fromValues(1.0, 0.0),
            vec2.fromValues(0.0, 0.0)
        ];

        const normals = [
            vec3.fromValues(0.0, 0.0, 1.0),
            vec3.fromValues(0.0, 0.0, 1.0),
            vec3.fromValues(0.0, 0.0, 1.0),
            vec3.fromValues(0.0, 0.0, 1.0)
        ];

        const indices = [
            0, 1, 2,
            0, 2, 3
        ];

        return { positions, normals, uvs, indices };
    }
}
