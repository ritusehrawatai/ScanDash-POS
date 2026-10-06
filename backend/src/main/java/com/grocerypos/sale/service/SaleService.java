package com.grocerypos.sale.service;

import com.grocerypos.sale.dto.CreateSaleRequestDto;
import com.grocerypos.sale.dto.SaleResponseDto;

import java.util.List;

public interface SaleService {

    SaleResponseDto processSale(CreateSaleRequestDto request);

    SaleResponseDto getSaleById(Long id);

    SaleResponseDto getSaleByReceiptNumber(String receiptNumber);

    List<SaleResponseDto> getAllSales();
}
