import { createFrameCopy } from './frame-copy';

export function createFrameCache(gl: WebGL2RenderingContext) {
    const copy = createFrameCopy(gl);
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    let width = 0;
    let height = 0;
    let valid = false;

    const capture = () => {
        if (!texture || !framebuffer || gl.isContextLost()) {
            return false;
        }
        const nextWidth = gl.drawingBufferWidth;
        const nextHeight = gl.drawingBufferHeight;
        if (nextWidth <= 0 || nextHeight <= 0) {
            return false;
        }

        const read = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
        const draw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
        const scissor = gl.isEnabled(gl.SCISSOR_TEST);
        try {
            gl.disable(gl.SCISSOR_TEST);
            if (width !== nextWidth || height !== nextHeight) {
                valid = false;
                const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texImage2D(
                    gl.TEXTURE_2D,
                    0,
                    gl.RGBA8,
                    nextWidth,
                    nextHeight,
                    0,
                    gl.RGBA,
                    gl.UNSIGNED_BYTE,
                    null,
                );
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.bindTexture(gl.TEXTURE_2D, previousTexture);
                gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffer);
                gl.framebufferTexture2D(
                    gl.DRAW_FRAMEBUFFER,
                    gl.COLOR_ATTACHMENT0,
                    gl.TEXTURE_2D,
                    texture,
                    0,
                );
                if (gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
                    return false;
                }
                width = nextWidth;
                height = nextHeight;
            }
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffer);
            gl.blitFramebuffer(
                0,
                0,
                width,
                height,
                0,
                0,
                width,
                height,
                gl.COLOR_BUFFER_BIT,
                gl.NEAREST,
            );
            valid = true;
            return true;
        } finally {
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read);
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw);
            if (scissor) {
                gl.enable(gl.SCISSOR_TEST);
            }
        }
    };

    return {
        capture,
        restore() {
            if (
                !valid ||
                !texture ||
                gl.isContextLost() ||
                width !== gl.drawingBufferWidth ||
                height !== gl.drawingBufferHeight
            ) {
                return false;
            }
            copy.draw(texture, width, height);
            return true;
        },
        invalidate() {
            valid = false;
        },
        dispose() {
            valid = false;
            copy.dispose();
            if (!gl.isContextLost()) {
                gl.deleteFramebuffer(framebuffer);
                gl.deleteTexture(texture);
            }
        },
    };
}
