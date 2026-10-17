import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { Principal } from '../../identity/domain/principal';
import { CurrentPrincipal, Public } from '../../identity/presentation/http/decorators/auth.decorators';
import { ReadFileUseCase } from '../application/read-file.use-case';
import { CompleteUploadUseCase, ReceiveUploadUseCase, RequestUploadUseCase } from '../application/upload-file.use-cases';
import { FileErrors } from '../domain/files.errors';
import { RequestUploadDto } from './dto/upload.dto';

/**
 * Subida en tres pasos (H02.3, RNF-08): pedir permiso → PUT de los bytes a la URL firmada → confirmar.
 * En el modo `s3` el PUT va directo al almacenamiento; en `database`, a esta misma API.
 */
@Controller('files')
export class FilesController {
  constructor(
    private readonly requestUpload: RequestUploadUseCase,
    private readonly receiveUpload: ReceiveUploadUseCase,
    private readonly completeUpload: CompleteUploadUseCase,
    private readonly readFile: ReadFileUseCase,
  ) {}

  @Post('uploads')
  async request(@CurrentPrincipal() principal: Principal, @Body() body: RequestUploadDto) {
    const result = await this.requestUpload.execute(principal, body);
    if (result.alreadyUploaded) return { fileId: result.fileId, alreadyUploaded: true };
    return { fileId: result.fileId, alreadyUploaded: false, ticket: result.ticket, upload: result.upload, expiresAt: result.expiresAt };
  }

  /** Destino de la URL firmada en el modo `database`. El permiso firmado reemplaza a la sesión. */
  @Public()
  @Put('uploads/:ticket')
  @HttpCode(HttpStatus.OK)
  receive(@Param('ticket') ticket: string, @Req() request: Request) {
    if (!Buffer.isBuffer(request.body)) throw FileErrors.contentMismatch();
    return this.receiveUpload.execute(ticket, request.body);
  }

  @Post('uploads/:ticket/complete')
  @HttpCode(HttpStatus.OK)
  complete(@CurrentPrincipal() principal: Principal, @Param('ticket') ticket: string) {
    return this.completeUpload.execute(principal, ticket);
  }

  @Public()
  @Get(':fileId/content')
  async content(
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() response: Response,
  ) {
    const file = await this.readFile.execute({ fileId, expires: Number(exp), signature: String(sig ?? '') });
    response
      .status(HttpStatus.OK)
      .set({
        'Content-Type': file.mimeType,
        'Content-Length': String(file.content.length),
        // La URL cambia al vencer: mientras tanto el contenido no cambia (el id es de un archivo inmutable).
        'Cache-Control': `public, max-age=${file.maxAgeSeconds}, immutable`,
        // La app y la web en desarrollo la leen desde otro origen.
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Content-Disposition': 'inline',
      })
      .end(file.content);
  }
}
