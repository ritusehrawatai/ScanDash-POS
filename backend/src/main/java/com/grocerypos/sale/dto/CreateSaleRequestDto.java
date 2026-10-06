package com.grocerypos.sale.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public class CreateSaleRequestDto {

    @NotEmpty(message = "Cart cannot be empty")
    @Valid
    private List<CreateSaleItemRequestDto> items;

    public CreateSaleRequestDto() {
    }

    public CreateSaleRequestDto(List<CreateSaleItemRequestDto> items) {
        this.items = items;
    }

    public List<CreateSaleItemRequestDto> getItems() {
        return items;
    }

    public void setItems(List<CreateSaleItemRequestDto> items) {
        this.items = items;
    }
}
