import { Material, Mesh, Root, Texture, WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { quat, vec2, vec3 } from 'gl-matrix';
import { addComponent, addEntity } from 'bitecs';
import {
    creaetDefaultTransformComponent, scene,
    createDefaultHierarchyComponent,
    createDefaultObjectComponent,
    creaetDefaultTagComponent,
    createDefaultMeshComponent,
    createDefaultMaterialComponent,
    invalid_id,
    clone,
} from './ecs';
import { createTexture, generateTangentData, vec4ArrayToFloat32Array } from './utils';

export class ModelLoader {
    private _cached = new Map<string, number>();

    public async load(url: string): Promise<number> {
        if (this._cached.has(url)) {
            const entity = this._cached.get(url);
            if (entity === undefined) {
                console.error('get model failed');
                return invalid_id;
            }
            return clone(entity);
        }
        const io = new WebIO()
            .registerExtensions(ALL_EXTENSIONS)
            .registerDependencies({
                'draco3d.decoder': await draco3d.createDecoderModule(),
                'draco3d.encoder': await draco3d.createEncoderModule(),
            });
        const document = await io.read(url);

        const rootNode = document.getRoot();

        const materialMap = this._prepareMaterials(rootNode);
        const meshMap = this._prepareMeshes(rootNode, materialMap);

        const scenes = rootNode.listScenes();
        if (scenes.length > 1) {
            console.error('more than one scene');
        }
        const { objects, transforms, hierarchies, tags } = scene.components;

        const rootEntity = addEntity(scene);
        addComponent(scene, rootEntity, objects);
        objects[rootEntity] = createDefaultObjectComponent();

        addComponent(scene, rootEntity, hierarchies);
        hierarchies[rootEntity] = createDefaultHierarchyComponent();

        addComponent(scene, rootEntity, transforms);
        transforms[rootEntity] = creaetDefaultTransformComponent();

        addComponent(scene, rootEntity, tags);
        tags[rootEntity] = creaetDefaultTagComponent();
        tags[rootEntity].tag = this._extractFileName(url);

        scenes[0].traverse((node) => {
            const objectEntity = addEntity(scene);
            addComponent(scene, objectEntity, objects);
            objects[objectEntity] = createDefaultObjectComponent();
            const objectComponent = objects[objectEntity];

            addComponent(scene, objectEntity, transforms);
            transforms[objectEntity] = creaetDefaultTransformComponent();
            const transformComponent = transforms[objectEntity];
            transformComponent.scale = node.getScale();
            const rotation = node.getRotation();
            transformComponent.rotation = quat.fromValues(rotation[0], rotation[1], rotation[2], rotation[3]);
            transformComponent.translation = node.getTranslation();

            addComponent(scene, objectEntity, hierarchies);
            hierarchies[objectEntity] = createDefaultHierarchyComponent();
            hierarchies[objectEntity].layer = 1;// todo: layer
            hierarchies[objectEntity].parent = rootEntity;

            addComponent(scene, objectEntity, tags);
            tags[objectEntity] = creaetDefaultTagComponent();
            tags[objectEntity].tag = node.getName();

            const mesh = node.getMesh();
            if (mesh) {
                const meshEntity = meshMap.get(mesh);
                if (!meshEntity) {
                    console.warn('cannot find mesh entity');
                } else {
                    objectComponent.meshEntities = meshEntity;
                }
            } else {
                console.log('no mesh');
            }
        })

        return rootEntity;
    }

    private _prepareMaterials(rootNode: Root) {
        const materialMap = new Map<Material, number>();
        const { materials } = scene.components;
        rootNode.listMaterials().forEach(material => {
            const materialEntity = addEntity(scene);
            addComponent(scene, materialEntity, materials);
            materials[materialEntity] = createDefaultMaterialComponent();
            const materialComponent = materials[materialEntity];

            materialComponent.diffuseTexture = this._createTexture(material.getBaseColorTexture());
            materialComponent.normalTexture = this._createTexture(material.getNormalTexture());
            materialComponent.occlusionTexture = this._createTexture(material.getOcclusionTexture());
            materialComponent.emissiveTexture = this._createTexture(material.getEmissiveTexture());
            materialComponent.metallicRoughnessTexture = this._createTexture(material.getMetallicRoughnessTexture());

            materialComponent.baseColorFactor = material.getBaseColorFactor();
            materialComponent.metallicFactor = material.getMetallicFactor();
            materialComponent.roughnessFactor = material.getRoughnessFactor();

            const specGlossExtension = material.getExtension('KHR_materials_pbrSpecularGlossiness');
            if (specGlossExtension) {
                console.log('  This material uses the Specular/Glossiness workflow.');
                // const diffuseFactor = specGlossExtension.getDiffuseFactor();
                // const specularFactor = specGlossExtension.getSpecularFactor();
                // console.log('  Diffuse Factor:', diffuseFactor);
                // console.log('  Specular Factor:', specularFactor);
            }

            materialMap.set(material, materialEntity);
        })
        return materialMap;
    }

    private _extractFileName(url: string): string {
        const fullName = url.substring(url.lastIndexOf('/') + 1);
        return fullName.replace(/\.[^/.]+$/, '');
    }

    private _prepareMeshes(rootNode: Root, materialMap: Map<Material, number>) {
        const meshMap = new Map<Mesh, number[]>();
        const { meshes } = scene.components;
        rootNode.listMeshes().forEach(mesh => {
            const meshEntities: number[] = [];

            mesh.listPrimitives().forEach((primitive, i) => {
                const meshEntity = addEntity(scene);
                meshEntities.push(meshEntity);
                addComponent(scene, meshEntity, meshes);
                meshes[meshEntity] = createDefaultMeshComponent();
                const meshComponent = meshes[meshEntity];

                const position = primitive.getAttribute('POSITION');
                if (!position) {
                    console.warn('No POSITION attribute found in primitive', primitive);
                    return;
                }
                const indices = primitive.getIndices();
                if (!indices) {
                    console.warn('No INDICES attribute found in primitive', primitive);
                    return;
                }

                meshComponent.positions = new Float32Array(position.getArray()!);

                for (let i = 0; i < meshComponent.positions.length; i += 3) {
                    meshComponent.bbox.expandByPoint(vec3.fromValues(meshComponent.positions[i], meshComponent.positions[i + 1], meshComponent.positions[i + 2]));
                }

                const normal = primitive.getAttribute('NORMAL');
                if (normal) {
                    meshComponent.normals = new Float32Array(normal.getArray()!);
                } else {
                    console.warn('no normal vertex');
                }
                const uv0 = primitive.getAttribute('TEXCOORD_0');
                if (uv0) {
                    meshComponent.uvs = new Float32Array(uv0.getArray()!);
                } else {
                    console.warn('no uv vertex');
                }
                const tangent = primitive.getAttribute('TANGENT');
                if (tangent) {
                    meshComponent.tangents = new Float32Array(tangent.getArray()!);
                } else if (uv0 && normal) {
                    const tangentData = generateTangentData(
                        this._accessorToVec3Array(position),
                        this._accessorToVec3Array(normal),
                        this._accessorToVec2Array(uv0),
                        this._accessorToIndexArray(indices));

                    meshComponent.tangents = vec4ArrayToFloat32Array(tangentData);
                }
                meshComponent.indices = new Uint32Array(indices.getArray()!);

                const material = primitive.getMaterial();
                if (!material) {
                    console.log('mesh do not has material');
                    return;
                }

                const materialEntity = materialMap.get(material);
                if (!materialEntity) {
                    console.warn('cannot find material entity');
                } else {
                    meshComponent.materialEntity.push(materialEntity);
                }
            });

            meshMap.set(mesh, meshEntities);
        });
        return meshMap;
    }

    private _createTexture(texture: Texture | null) {
        return createTexture(texture?.getImage(), texture?.getSize(), texture?.getName());
    }
    private _accessorToVec3Array(accessor: any): vec3[] {
        const arr = accessor.getArray(); // Float32Array
        const count = accessor.getCount();
        const output: vec3[] = new Array(count);

        for (let i = 0; i < count; i++) {
            const offset = i * 3; // vec3
            output[i] = vec3.fromValues(arr[offset], arr[offset + 1], arr[offset + 2]);
        }

        return output;
    }

    private _accessorToVec2Array(accessor: any): vec2[] {
        const arr = accessor.getArray(); // Float32Array
        const count = accessor.getCount();
        const output: vec2[] = new Array(count);

        for (let i = 0; i < count; i++) {
            const offset = i * 2; // vec2
            output[i] = vec2.fromValues(arr[offset], arr[offset + 1]);
        }

        return output;
    }

    private _accessorToIndexArray(accessor: any): number[] {
        const arr = accessor.getArray(); // Uint16Array / Uint32Array
        return Array.from(arr);
    }
}
