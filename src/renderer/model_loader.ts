import { Material, Mesh, Root, Texture, WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { quat, vec2, vec3, vec4 } from 'gl-matrix';
import { addComponent, addEntity } from 'bitecs';
import {
    defaultHierarchyComponent, defaultMaterialComponent, defaultMeshComponent, defaultObjectComponent, defaultTextureData,
    defaultTransformComponent, defaultTagComponent, scene
} from './ecs';

export class ModelLoader {
    public constructor() { }

    public async load(url: string) {
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
        objects[rootEntity] = { ...defaultObjectComponent };

        addComponent(scene, rootEntity, hierarchies);
        hierarchies[rootEntity] = { ...defaultHierarchyComponent };

        addComponent(scene, rootEntity, transforms);
        transforms[rootEntity] = { ...defaultTransformComponent };

        addComponent(scene, rootEntity, tags);
        tags[rootEntity] = { ...defaultTagComponent, ...{ tag: this._extractFileName(url) } };

        scenes[0].traverse((node) => {
            const objectEntity = addEntity(scene);
            addComponent(scene, objectEntity, objects);
            objects[objectEntity] = { ...defaultObjectComponent };
            const objectComponent = objects[objectEntity];

            addComponent(scene, objectEntity, transforms);
            transforms[objectEntity] = { ...defaultTransformComponent };
            const transformComponent = transforms[objectEntity];
            transformComponent.localMatrix = node.getMatrix();
            transformComponent.worldMatrix = node.getWorldMatrix();
            transformComponent.scale = node.getScale();
            const rotation = node.getRotation();
            transformComponent.rotation = quat.fromValues(rotation[0], rotation[1], rotation[2], rotation[3]);
            transformComponent.translation = node.getTranslation();

            addComponent(scene, objectEntity, hierarchies);
            hierarchies[objectEntity] = { ...defaultHierarchyComponent, ...{ parent: rootEntity, layer: 1 } }; // todo: layer

            addComponent(scene, objectEntity, tags);
            tags[objectEntity] = { ...defaultTagComponent, ...{ tag: node.getName() } };

            const mesh = node.getMesh();
            if (mesh) {
                const meshEntity = meshMap.get(mesh);
                if (!meshEntity) {
                    console.warn('cannot find mesh entity');
                } else {
                    objectComponent.meshEntities = meshEntity;
                }
            }else{
                console.log('no mesh');
            }
        })
    }

    private _prepareMaterials(rootNode: Root) {
        const materialMap = new Map<Material, number>();
        const { materials } = scene.components;
        rootNode.listMaterials().forEach(material => {
            const materialEntity = addEntity(scene);
            addComponent(scene, materialEntity, materials);
            materials[materialEntity] = { ...defaultMaterialComponent, ...{ materialEntity: [] } };
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
                meshes[meshEntity] = {
                    ...defaultMeshComponent, ...{ vertexBuffers: [] }
                };
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
                }
                const uv0 = primitive.getAttribute('TEXCOORD_0');
                if (uv0) {
                    meshComponent.uvs = new Float32Array(uv0.getArray()!);
                }
                const tangent = primitive.getAttribute('TANGENT');
                if (tangent) {
                    meshComponent.tangents = new Float32Array(tangent.getArray()!);
                } else {
                    const tangentData = this._generateTangentData(
                        this._accessorToVec3Array(position),
                        this._accessorToVec3Array(normal),
                        this._accessorToVec2Array(uv0),
                        this._accessorToIndexArray(indices));

                    meshComponent.tangents = this._vec4ArrayToFloat32Array(tangentData);
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
        const res = { ...defaultTextureData };
        if (!texture) {
            return res;
        }
        const size = texture.getSize();
        if (!size) {
            throw new Error('get image size failed');
        }
        const [width, height] = size;

        const imageData = texture.getImage() as Uint8Array;

        res.width = width;
        res.height = height;
        res.data = imageData;
        res.name = texture.getName();

        return res;
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

    private _vec4ArrayToFloat32Array(tangents: vec4[]): Float32Array<ArrayBuffer> {
        const arr = new Float32Array(tangents.length * 4);
        for (let i = 0; i < tangents.length; i++) {
            arr[i * 4 + 0] = tangents[i][0];
            arr[i * 4 + 1] = tangents[i][1];
            arr[i * 4 + 2] = tangents[i][2];
            arr[i * 4 + 3] = tangents[i][3];
        }
        return arr;
    }

    private _generateTangentData(
        positions: vec3[],
        normals: vec3[],
        uvs: vec2[],
        indices: number[]
    ): vec4[] {
        const tangents: vec4[] = new Array(positions.length)
            .fill(0)
            .map(() => vec4.create());

        for (let i = 0; i < indices.length; i += 3) {
            const i0 = indices[i + 0];
            const i1 = indices[i + 1];
            const i2 = indices[i + 2];

            const v0 = positions[i0];
            const v1 = positions[i1];
            const v2 = positions[i2];

            let uv0 = vec2.clone(uvs[i0]);
            let uv1 = vec2.clone(uvs[i1]);
            let uv2 = vec2.clone(uvs[i2]);

            uv0[1] *= -1;
            uv1[1] *= -1;
            uv2[1] *= -1;

            const n0 = normals[i0];
            const n1 = normals[i1];
            const n2 = normals[i2];

            const facenormal = vec3.create();
            vec3.add(facenormal, n0, n1);
            vec3.add(facenormal, facenormal, n2);
            vec3.normalize(facenormal, facenormal);

            const e1 = vec3.create();
            const e2 = vec3.create();
            vec3.subtract(e1, v1, v0);
            vec3.subtract(e2, v2, v0);

            const s1 = uv1[0] - uv0[0];
            const s2 = uv2[0] - uv0[0];
            const t1 = uv1[1] - uv0[1];
            const t2 = uv2[1] - uv0[1];

            const denom = s1 * t2 - s2 * t1;
            if (Math.abs(denom) < 1e-8) {
                console.warn('Denom is zero when generating tangents');
                continue;
            }

            const r = 1.0 / denom;

            const sdir = vec3.create();
            const tdir = vec3.create();

            const tmp1 = vec3.create();
            const tmp2 = vec3.create();
            vec3.scale(tmp1, e1, t2);
            vec3.scale(tmp2, e2, t1);
            vec3.subtract(sdir, tmp1, tmp2);
            vec3.scale(sdir, sdir, r);

            vec3.scale(tmp1, e2, s1);
            vec3.scale(tmp2, e1, s2);
            vec3.subtract(tdir, tmp1, tmp2);
            vec3.scale(tdir, tdir, r);

            const tangent = vec3.create();
            const dot = vec3.dot(facenormal, sdir);
            vec3.scale(tmp1, facenormal, dot);
            vec3.subtract(tangent, sdir, tmp1);
            vec3.normalize(tangent, tangent);

            const cross = vec3.create();
            vec3.cross(cross, tangent, facenormal);
            const sign = vec3.dot(cross, tdir) < 0 ? -1 : 1;

            const t = vec4.fromValues(tangent[0], tangent[1], tangent[2], sign);

            for (const idx of [i0, i1, i2]) {
                vec4.add(tangents[idx], tangents[idx], t);
            }
        }

        for (let i = 0; i < tangents.length; i++) {
            const t = tangents[i];
            const tangentVec = vec3.fromValues(t[0], t[1], t[2]);
            vec3.normalize(tangentVec, tangentVec);
            tangents[i] = vec4.fromValues(tangentVec[0], tangentVec[1], tangentVec[2], t[3]);
        }

        return tangents;
    }
}
