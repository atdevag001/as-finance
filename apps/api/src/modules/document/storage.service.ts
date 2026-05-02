import { Injectable } from '@nestjs/common';
import { Readable } from 'stream';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';

export interface StorageUploadParams {
  bucket: string;
  key: string;
  body: Buffer;
  contentType: string;
}

export interface StorageService {
  upload(params: StorageUploadParams): Promise<void>;
  getSignedUrl(bucket: string, key: string, expiresInSeconds: number): Promise<string>;
  getFileStream(bucket: string, key: string): Promise<Readable>;
  delete(bucket: string, key: string): Promise<void>;
}

@Injectable()
export class S3StorageService implements StorageService {
  private readonly client: S3Client;

  constructor() {
    this.client = new S3Client({
      endpoint: process.env['S3_ENDPOINT'],
      region: process.env['S3_REGION'] || 'us-east-1',
      credentials: {
        accessKeyId: process.env['S3_ACCESS_KEY'] || '',
        secretAccessKey: process.env['S3_SECRET_KEY'] || '',
      },
      forcePathStyle: true,
    });
  }

  async upload(params: StorageUploadParams): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
      }),
    );
  }

  async getSignedUrl(bucket: string, key: string, expiresInSeconds: number): Promise<string> {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async getFileStream(bucket: string, key: string): Promise<Readable> {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await this.client.send(command);
    return response.Body as Readable;
  }

  async delete(bucket: string, key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    );
  }
}
