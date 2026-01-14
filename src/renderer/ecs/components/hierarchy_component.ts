import { invalid_id } from "../constant";

export type HierarchyComponent = {
    parent: number;
}

export const defaultHierarchyComponent = {
    parent: invalid_id,
}
