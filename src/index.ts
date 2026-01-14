import { Game } from './game';
import { GraphicsDevice } from "@eric-schecter/graphics";

async function init(): Promise<void> {
    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    document.body.appendChild(canvas);

    const graphicsDevie = await GraphicsDevice.create(canvas);

    const game = new Game(graphicsDevie);

    game.render();
}

init().catch((err) => console.error(err));
