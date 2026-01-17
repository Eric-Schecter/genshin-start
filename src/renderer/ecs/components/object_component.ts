export type ObjectComponent = {
    meshEntities: number[],
}

export const createDefaultObjectComponent = () => {
    return { meshEntities: [] }
}
