import { Module } from '@nestjs/common';
import { LoanProductService } from './loan-product.service';
import { LoanProductController } from './loan-product.controller';
import { LoanProductRepository } from './loan-product.repository';

@Module({
  controllers: [LoanProductController],
  providers: [LoanProductService, LoanProductRepository],
  exports: [LoanProductService],
})
export class LoanProductModule {}
