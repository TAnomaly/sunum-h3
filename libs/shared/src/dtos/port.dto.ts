import { IsString, IsNumber, IsBoolean, IsOptional, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CoordinateDto {
    @IsNumber({}, { message: 'Latitude must be a number' })
    @Min(-90, { message: 'Latitude must be between -90 and 90' })
    @Max(90, { message: 'Latitude must be between -90 and 90' })
    latitude!: number;

    @IsNumber({}, { message: 'Longitude must be a number' })
    @Min(-180, { message: 'Longitude must be between -180 and 180' })
    @Max(180, { message: 'Longitude must be between -180 and 180' })
    longitude!: number;
}

export class CreatePortDto {
    @IsString({ message: 'Name must be a string' })
    name!: string;

    @IsString({ message: 'Code must be a string' })
    code!: string;

    @IsString({ message: 'Country must be a string' })
    country!: string;

    @ValidateNested()
    @Type(() => CoordinateDto)
    coordinate!: CoordinateDto;
}

export class UpdatePortDto {
    @IsOptional()
    @IsString({ message: 'Name must be a string' })
    name?: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => CoordinateDto)
    coordinate?: CoordinateDto;
}

export class PortResponseDto {
    id!: string;
    name!: string;
    code!: string;
    country!: string;
    coordinate!: CoordinateDto;
    h3Index!: string;
    isActive!: boolean;
    createdAt!: Date;
    updatedAt!: Date;
}

export class FindNearestPortDto {
    @ValidateNested()
    @Type(() => CoordinateDto)
    coordinate!: CoordinateDto;

    @IsOptional()
    @IsNumber({}, { message: 'Radius must be a number' })
    @Min(1, { message: 'Radius must be at least 1 km' })
    radiusKm?: number;
}

export class NearestPortResponseDto {
    port!: PortResponseDto;
    distanceKm!: number;
    h3Distance!: number;
}
