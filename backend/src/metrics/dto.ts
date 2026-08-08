import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpsertSnapshotDto {
  @IsDateString() month!: string;
  @IsNumber() mrr!: number;
  @IsNumber() newMrr!: number;
  @IsNumber() expansionMrr!: number;
  @IsNumber() contractionMrr!: number;
  @IsNumber() churnedMrr!: number;
  @IsNumber() newCustomers!: number;
  @IsNumber() churnedCustomers!: number;
  @IsNumber() totalCustomers!: number;
  @IsNumber() burnRate!: number;
  @IsNumber() cash!: number;
  @IsOptional() @IsString() notes?: string;
}

export class ImportCsvDto {
  @IsString() csv!: string;
  @IsOptional() commit?: boolean;
}
