import upload from "../../config/multer";
import { Request, Response, NextFunction } from "express";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import logger from "../utils/logger.js";

// Garante de forma segura que a pasta de uploads exista em qualquer ambiente (Windows/Linux)
const UPLOAD_DIR = path.resolve(process.cwd(), 'images', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const uploadMaxCountMiddleware = upload.fields([
  { name: "mainImage", maxCount: 1 },
  { name: "extraImages", maxCount: 10 },
]);

function validateMainImageMinCount(req: Request, res: Response, next: NextFunction) {
  if (!req.files || !("mainImage" in req.files) || !(req.files as any).mainImage.length) {
    return res.status(400).json({ error: "mainImage is mandatory" });
  }
  next();
}

async function processImagesWithSharp(req: Request, res: Response, next: NextFunction) {
  try {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

    // 1. Processamento da mainImage
    if (req.files && !Array.isArray(req.files) && req.files.mainImage && req.files.mainImage[0]) {
      const imageBuffer = (req.files.mainImage[0] as Express.Multer.File).buffer;
      const originalName = req.files.mainImage[0].originalname;
      const sanitizedName = path.parse(originalName).name.replace(/\s+/g, "-");
      
      // Nome salvo no banco de dados (Apenas o arquivo, ex: "171234567-foto.webp")
      const webpName = `${uniqueSuffix}-${sanitizedName}.webp`;
      const uploadPath = path.join(UPLOAD_DIR, webpName);

      await sharp(imageBuffer)
        .resize(800, 800, { fit: "cover" }) // Opcional: Garante proporções perfeitas 800x800
        .webp({ quality: 80 }) // Opcional: Controla a qualidade/compressão do WebP
        .toFile(uploadPath);

      // Injeta apenas o nome do arquivo para o seu Controller salvar no banco
      req.body.mainImageWebp = webpName;
    }

    // 2. Processamento das extraImages
    if (req.files && !Array.isArray(req.files) && req.files.extraImages && Array.isArray(req.files.extraImages)) {
      req.body.extraImagesWebp = [];

      for (const [index, file] of (req.files.extraImages as Express.Multer.File[]).entries()) {
        const extraBuffer = file.buffer;
        const originalName = file.originalname;
        const sanitizedName = path.parse(originalName).name.replace(/\s+/g, "-");

        // Index in the suffix avoids name collisions between extra images of the same batch
        const webpName = `${uniqueSuffix}-${index}-${sanitizedName}.webp`;
        const extraUploadPath = path.join(UPLOAD_DIR, webpName);

        await sharp(extraBuffer)
          .resize(800, 800, { fit: "cover" })
          .webp({ quality: 80 })
          .toFile(extraUploadPath);

        req.body.extraImagesWebp.push(webpName);
      }
    }

    logger.info('upload.processed', { event: 'upload.processed', main: Boolean(req.body.mainImageWebp), extras: req.body.extraImagesWebp?.length ?? 0 });
    next();
  } catch (error: any) {
    logger.error('upload.processing_failed', { event: 'upload.processing_failed', reason: (error as Error)?.message });
    return res.status(500).json({ error: "Error processing image" });
  }
}

const uploadMiddleware = [
  uploadMaxCountMiddleware,
  validateMainImageMinCount,
  processImagesWithSharp,
];

const uploadMiddlewareNotMandatory = [
  uploadMaxCountMiddleware,
  processImagesWithSharp,
];

export { uploadMiddleware, uploadMiddlewareNotMandatory };