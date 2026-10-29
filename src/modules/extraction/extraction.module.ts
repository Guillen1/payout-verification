import { Module } from "@nestjs/common";
import { ModelClientModule } from "../../libs/model-client/model-client.module";
import { FormatProposalService } from "./application/services/format-proposal.service";
import { PdfStatementReaderService } from "./application/services/pdf-statement-reader.service";

/** Reading carrier statements: CSVs by format config, PDFs and changed layouts with the model's help. */
@Module({
  imports: [ModelClientModule],
  providers: [PdfStatementReaderService, FormatProposalService],
  exports: [PdfStatementReaderService, FormatProposalService]
})
export class ExtractionModule {}
