export interface Point {
    x: number;
    y: number;
}

type Color = readonly [number, number, number, number];

export function shapeColor(hex: string, opacity = 1): Color {
    return [
        parseInt(hex.slice(1, 3), 16) / 255,
        parseInt(hex.slice(3, 5), 16) / 255,
        parseInt(hex.slice(5, 7), 16) / 255,
        opacity,
    ];
}

export class ShapeMesh {
    readonly vertices: number[] = [];
    revision = 0;

    reset() {
        this.vertices.length = 0;
        this.revision++;
    }

    private vertex(point: Point, local: Point, color: Color, radius: number, length: number) {
        this.vertices.push(point.x, point.y, local.x, local.y, ...color, radius, length);
        this.revision++;
    }

    fill(points: Point[], color: Color) {
        for (let index = 1; index < points.length - 1; index++) {
            for (const point of [points[0], points[index], points[index + 1]]) {
                this.vertex(point, { x: 0, y: 0 }, color, -1, 0);
            }
        }
    }

    line(start: Point, end: Point, width: number, color: Color, endColor: Color = color) {
        const length = Math.hypot(end.x - start.x, end.y - start.y);
        const dx = length ? (end.x - start.x) / length : 1;
        const dy = length ? (end.y - start.y) / length : 0;
        const radius = width / 2;
        const padding = radius + 1;
        const corners = [
            { x: -padding, y: -padding },
            { x: length + padding, y: -padding },
            { x: length + padding, y: padding },
            { x: -padding, y: padding },
        ];

        for (const index of [0, 1, 2, 0, 2, 3]) {
            const local = corners[index];
            this.vertex(
                {
                    x: start.x + local.x * dx - local.y * dy,
                    y: start.y + local.x * dy + local.y * dx,
                },
                local,
                index === 1 || index === 2 ? endColor : color,
                radius,
                length,
            );
        }
    }

    private stroke(points: Point[], width: number, color: Color) {
        if (points.length < 2) {
            return;
        }
        const distances = [0];
        const directions = points.slice(1).map((point, index) => {
            const previous = points[index];
            const length = Math.hypot(point.x - previous.x, point.y - previous.y);
            distances.push(distances[index] + length);
            return { x: (point.x - previous.x) / length, y: (point.y - previous.y) / length };
        });
        const length = distances[distances.length - 1];
        const padding = width / 2 + 1;
        const pairs = points.map((point, index) => {
            const before = directions[Math.max(0, index - 1)];
            const after = directions[Math.min(index, directions.length - 1)];
            const sum = { x: -before.y - after.y, y: before.x + after.x };
            const magnitude = Math.hypot(sum.x, sum.y);
            const normal =
                magnitude > 0.001
                    ? { x: sum.x / magnitude, y: sum.y / magnitude }
                    : { x: -after.y, y: after.x };
            const scale = padding / Math.max(0.25, normal.x * -after.y + normal.y * after.x);
            let extension = 0;
            if (index === 0) {
                extension = -padding;
            } else if (index === points.length - 1) {
                extension = padding;
            }
            const center = { x: point.x + after.x * extension, y: point.y + after.y * extension };
            return [-1, 1].map((side) => ({
                point: {
                    x: center.x + normal.x * scale * side,
                    y: center.y + normal.y * scale * side,
                },
                local: { x: distances[index] + extension, y: padding * side },
            }));
        });

        for (let index = 1; index < pairs.length; index++) {
            for (const vertex of [
                pairs[index - 1][0],
                pairs[index][0],
                pairs[index][1],
                pairs[index - 1][0],
                pairs[index][1],
                pairs[index - 1][1],
            ]) {
                this.vertex(vertex.point, vertex.local, color, width / 2, length);
            }
        }
    }

    dashedPath(points: Point[], width: number, color: Color, dash: number, gap: number) {
        let visible = true;
        let remaining = dash;
        let path: Point[] = [];

        for (let index = 1; index < points.length; index++) {
            const start = points[index - 1];
            const end = points[index];
            const length = Math.hypot(end.x - start.x, end.y - start.y);
            let position = 0;
            const point = (offset: number) => ({
                x: start.x + ((end.x - start.x) * offset) / length,
                y: start.y + ((end.y - start.y) * offset) / length,
            });

            while (position < length) {
                const step = Math.min(length - position, remaining);
                if (visible) {
                    if (!path.length) {
                        path.push(point(position));
                    }
                    path.push(point(position + step));
                }
                position += step;
                remaining -= step;
                if (remaining < 0.00001) {
                    if (visible) {
                        this.stroke(path, width, color);
                        path = [];
                    }
                    visible = !visible;
                    remaining = visible ? dash : gap;
                }
            }
        }
        this.stroke(path, width, color);
    }
}

const vertexSource = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_local;
layout(location = 2) in vec4 a_color;
layout(location = 3) in vec2 a_shape;
uniform vec2 u_resolution;
out vec2 v_local;
out vec4 v_color;
flat out vec2 v_shape;
void main() {
    gl_Position = vec4(a_position / u_resolution * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);
    v_local = a_local;
    v_color = a_color;
    v_shape = a_shape;
}`;

const fragmentSource = `#version 300 es
precision highp float;
in vec2 v_local;
in vec4 v_color;
flat in vec2 v_shape;
out vec4 fragColor;
void main() {
    float coverage = 1.0;
    if (v_shape.x >= 0.0) {
        vec2 nearest = vec2(clamp(v_local.x, 0.0, v_shape.y), 0.0);
        float distance = length(v_local - nearest) - v_shape.x;
        float feather = max(fwidth(distance), 0.001);
        coverage = 1.0 - smoothstep(-feather * 0.5, feather * 0.5, distance);
    }
    float alpha = v_color.a * coverage;
    if (alpha <= 0.0) discard;
    fragColor = vec4(v_color.rgb * alpha, alpha);
}`;

export function createShapeProgram(gl: WebGL2RenderingContext) {
    const shaders: WebGLShader[] = [];
    const program = gl.createProgram();
    const buffer = gl.createBuffer();
    const vao = gl.createVertexArray();
    let alive = true;
    const contextLost = () => {
        alive = false;
    };
    gl.canvas.addEventListener('webglcontextlost', contextLost);

    const kill = () => {
        gl.canvas.removeEventListener('webglcontextlost', contextLost);
        if (!alive || gl.isContextLost()) {
            return;
        }
        alive = false;
        for (const shader of shaders) {
            gl.deleteShader(shader);
        }
        gl.deleteProgram(program);
        gl.deleteBuffer(buffer);
        gl.deleteVertexArray(vao);
    };

    try {
        if (!program || !buffer || !vao) {
            throw new Error('Unable to allocate WebGL shape resources.');
        }
        for (const [type, source] of [
            [gl.VERTEX_SHADER, vertexSource],
            [gl.FRAGMENT_SHADER, fragmentSource],
        ] as const) {
            const shader = gl.createShader(type);
            if (!shader) {
                throw new Error('Unable to allocate WebGL shape shader.');
            }
            shaders.push(shader);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                throw new Error(
                    `Unable to compile WebGL shape shader: ${gl.getShaderInfoLog(shader)}`,
                );
            }
            gl.attachShader(program, shader);
        }
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(`Unable to link WebGL shape program: ${gl.getProgramInfoLog(program)}`);
        }
    } catch (error) {
        kill();
        throw error;
    }

    const resolution = gl.getUniformLocation(program!, 'u_resolution');
    const previousVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
    const previousBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const [index, size, offset] of [
        [0, 2, 0],
        [1, 2, 2],
        [2, 4, 4],
        [3, 2, 8],
    ]) {
        gl.enableVertexAttribArray(index);
        gl.vertexAttribPointer(index, size, gl.FLOAT, false, 40, offset * 4);
    }
    gl.bindVertexArray(previousVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, previousBuffer);

    let data = new Float32Array(0);
    let capacity = 0;
    let uploadedMesh: ShapeMesh | null = null;
    let uploadedRevision = -1;

    return {
        draw(mesh: ShapeMesh, width: number, height: number) {
            if (
                !alive ||
                !mesh.vertices.length ||
                width <= 0 ||
                height <= 0 ||
                gl.isContextLost()
            ) {
                return;
            }

            const previousProgram = gl.getParameter(gl.CURRENT_PROGRAM);
            const previousVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
            const previousBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
            const depth = gl.isEnabled(gl.DEPTH_TEST);
            const blend = gl.isEnabled(gl.BLEND);
            const blendSourceRgb = gl.getParameter(gl.BLEND_SRC_RGB);
            const blendDestinationRgb = gl.getParameter(gl.BLEND_DST_RGB);
            const blendSourceAlpha = gl.getParameter(gl.BLEND_SRC_ALPHA);
            const blendDestinationAlpha = gl.getParameter(gl.BLEND_DST_ALPHA);

            gl.disable(gl.DEPTH_TEST);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.useProgram(program);
            gl.bindVertexArray(vao);
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            if (uploadedMesh !== mesh || uploadedRevision !== mesh.revision) {
                if (data.length < mesh.vertices.length) {
                    data = new Float32Array(2 ** Math.ceil(Math.log2(mesh.vertices.length)));
                }
                data.set(mesh.vertices);
                if (capacity < data.byteLength) {
                    gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
                    capacity = data.byteLength;
                }
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, mesh.vertices.length);
                uploadedMesh = mesh;
                uploadedRevision = mesh.revision;
            }
            gl.uniform2f(resolution, width, height);
            gl.drawArrays(gl.TRIANGLES, 0, mesh.vertices.length / 10);

            gl.bindVertexArray(previousVao);
            gl.bindBuffer(gl.ARRAY_BUFFER, previousBuffer);
            gl.useProgram(previousProgram);
            gl.blendFuncSeparate(
                blendSourceRgb,
                blendDestinationRgb,
                blendSourceAlpha,
                blendDestinationAlpha,
            );
            if (depth) {
                gl.enable(gl.DEPTH_TEST);
            }
            if (!blend) {
                gl.disable(gl.BLEND);
            }
        },
        kill,
    };
}
