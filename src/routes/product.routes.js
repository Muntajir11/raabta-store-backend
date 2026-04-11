import { Router } from 'express';
import * as productController from '../controllers/product.controller.js';

export const productRouter = Router();

productRouter.get('/:productId/image', productController.getImage);
productRouter.get('/', productController.list);
