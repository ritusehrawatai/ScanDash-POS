package com.grocerypos.sale.repository;

import com.grocerypos.sale.entity.Sale;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SaleRepository extends JpaRepository<Sale, Long> {

    Optional<Sale> findByReceiptNumber(String receiptNumber);

    List<Sale> findAllByOrderByCreatedAtDesc();
}
