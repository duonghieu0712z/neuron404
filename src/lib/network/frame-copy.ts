const vertexSource = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
    vec2 uv = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    v_uv = uv;
    gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
}`;

const fragmentSource = `#version 300 es
precision highp float;
uniform sampler2D u_image;
in vec2 v_uv;
out vec4 fragColor;
void main() {
    fragColor = texture(u_image, v_uv);
}`;

export function createFrameCopy(gl: WebGL2RenderingContext) {
    const program = gl.createProgram();
    const vao = gl.createVertexArray();
    const shaders: WebGLShader[] = [];
    const dispose = () => {
        if (gl.isContextLost()) {
            return;
        }
        for (const shader of shaders) {
            gl.deleteShader(shader);
        }
        gl.deleteProgram(program);
        gl.deleteVertexArray(vao);
    };

    try {
        if (!program || !vao) {
            throw new Error('Unable to allocate frame copy resources.');
        }
        for (const [type, source] of [
            [gl.VERTEX_SHADER, vertexSource],
            [gl.FRAGMENT_SHADER, fragmentSource],
        ] as const) {
            const shader = gl.createShader(type);
            if (!shader) {
                throw new Error('Unable to allocate frame copy shader.');
            }
            shaders.push(shader);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                throw new Error(
                    `Unable to compile frame copy shader: ${gl.getShaderInfoLog(shader)}`,
                );
            }
            gl.attachShader(program, shader);
        }
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(`Unable to link frame copy program: ${gl.getProgramInfoLog(program)}`);
        }
    } catch (error) {
        dispose();
        throw error;
    }

    const image = gl.getUniformLocation(program!, 'u_image');
    return {
        draw(texture: WebGLTexture, width: number, height: number) {
            const framebuffer = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
            const previousProgram = gl.getParameter(gl.CURRENT_PROGRAM);
            const previousVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
            const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
            const colorMask = gl.getParameter(gl.COLOR_WRITEMASK) as boolean[];
            const activeTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
            const flags = [gl.BLEND, gl.DEPTH_TEST, gl.SCISSOR_TEST, gl.CULL_FACE];
            const enabled = flags.map((flag) => gl.isEnabled(flag));
            gl.activeTexture(gl.TEXTURE0);
            const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
            const previousSampler = gl.getParameter(gl.SAMPLER_BINDING);
            try {
                for (const flag of flags) {
                    gl.disable(flag);
                }
                gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
                gl.viewport(0, 0, width, height);
                gl.colorMask(true, true, true, true);
                gl.useProgram(program);
                gl.bindVertexArray(vao);
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.bindSampler(0, null);
                gl.uniform1i(image, 0);
                // A draw presents the cached scene correctly with preserveDrawingBuffer disabled.
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            } finally {
                gl.bindTexture(gl.TEXTURE_2D, previousTexture);
                gl.bindSampler(0, previousSampler);
                gl.activeTexture(activeTexture);
                gl.bindVertexArray(previousVao);
                gl.useProgram(previousProgram);
                gl.colorMask(colorMask[0], colorMask[1], colorMask[2], colorMask[3]);
                gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
                gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffer);
                flags.forEach((flag, index) => {
                    if (enabled[index]) {
                        gl.enable(flag);
                    }
                });
            }
        },
        dispose,
    };
}
