import { invalid_id } from "../constant";

export type HierarchyComponent = {
    parent: number;
    layer: number;
}

export const defaultHierarchyComponent = {
    parent: invalid_id,
    layer: 0,
}
