export function getRegionNodeId(regionId: string) {
    return `region:${regionId}`;
}

export function regionHexagon() {
    return {
        name: 'hexagon',
        uniforms: [],
        inradiusFactor: Math.sqrt(3) / 2,
        glsl: `
float sdf_hexagon(vec2 uv, float size) {
    vec2 p = abs(uv);
    float apothem = size * 0.8660254038;
    vec2 direction = vec2(0.8660254038, -0.5);
    vec2 offset = p - vec2(0.0, size);
    float projection = clamp(dot(offset, direction), 0.0, size);
    float diagonal = length(offset - direction * projection);
    float vertical = length(p - vec2(apothem, clamp(p.y, 0.0, size * 0.5)));
    float outside = max(p.x - apothem, p.x * 0.5 + p.y * 0.8660254038 - apothem);
    return min(diagonal, vertical) * (outside > 0.0 ? 1.0 : -1.0);
}
`,
    };
}
